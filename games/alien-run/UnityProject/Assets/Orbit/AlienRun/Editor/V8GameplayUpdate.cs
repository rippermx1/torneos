using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
namespace Orbit.AlienRun.Editor
{
    // Updates the user's saved V8 in place. Never invokes the older scene generators.
    public static class V8GameplayUpdate
    {
        const string Pack="Assets/KayKit/Packs/KayKit - Platformer Pack (for Unity)/Prefabs/";
        static Transform root;
        static Material kit,characters;
        static RunSession session;
        public static void Apply()
        {
            var scene=EditorSceneManager.OpenScene(LevelPlayBuilder.ScenePath);
            if(GameObject.Find("V8InteractionUpdate")!=null)throw new InvalidOperationException("Esta V8 ya fue actualizada; conserva las ediciones posteriores.");
            root=new GameObject("V8InteractionUpdate").transform;
            session=UnityEngine.Object.FindFirstObjectByType<RunSession>();
            kit=ProductLevelBuilder.LoadMaterial("PlatformerURP");characters=ProductLevelBuilder.LoadMaterial("EngineerURP");
            // Owner requested that this accidentally separated section fit the level again.
            var tail=GameObject.Find("ProductLevelV7");var tailPosition=tail.transform.position;tailPosition.y=0;tail.transform.position=tailPosition;
            var camera=Camera.main;var follow=camera.GetComponent<FollowCamera>();
            camera.orthographicSize=4.8f;follow.baseFocusY=3.25f;follow.offset=new Vector3(0,3,-18);
            follow.verticalFollow=.85f;follow.maxVerticalLift=16;follow.stableFraming=true;follow.minFocusX=2f;
            follow.SnapTo(session.spawn);
            session.gameObject.AddComponent<PlayerTransitions>();
            // Extend the existing beginning under the offscreen walk-in.
            var ground=GameObject.Find("Ground_A");ground.transform.position=new Vector3(4.5f,-.5f,0);ground.transform.localScale=new Vector3(33,1,4);
            for(var i=0;i<2;i++)Art("yellow/platform_4x4x2_yellow","EntryFoundation_"+i,new Vector3(-10.25f+i*3.5f,-1.5f,0),new Vector3(3.5f,3,4));
            ConfigureAnimation();
            foreach(var t in UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))
                if(PrefabUtility.IsAnyPrefabInstanceRoot(t.gameObject)) {
                    var path=PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(t.gameObject);
                    if(path.Contains("Platformer"))Paint(t.gameObject,kit);
                }
            // Align moved platform/hazard colliders with their visible art.
            foreach(var box in UnityEngine.Object.FindObjectsByType<BoxCollider>(FindObjectsSortMode.None))
                if(box.name.StartsWith("Upper_")) {
                    var art=GameObject.Find("KayKit_"+box.name);
                    if(art==null){box.enabled=false;continue;}
                    FitBox(box,BoundsOf(art));
                }
            foreach(var name in new[]{"01","02"}) {
                var hazard=GameObject.Find("Hazard_"+name);var art=GameObject.Find("KayKit_Hazard_"+name+"_Spikes");
                if(hazard!=null && art!=null)FitBox(hazard.GetComponent<BoxCollider>(),BoundsOf(art));
            }
            foreach(var hazard in UnityEngine.Object.FindObjectsByType<MovingHazard>(FindObjectsSortMode.None))
                if(hazard.GetComponentsInChildren<Renderer>().Length==0)hazard.gameObject.SetActive(false);
            foreach(var enemy in UnityEngine.Object.FindObjectsByType<PatrolEnemy>(FindObjectsSortMode.None))
                if(enemy.GetComponentsInChildren<Renderer>().Length==0){enemy.enabled=false;enemy.gameObject.SetActive(false);}

            var authored=UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsSortMode.None).Where(t=>t.parent==null).ToArray();
            foreach(var t in authored) {
                if(t.name.StartsWith("pillar_2x2") || t.name.StartsWith("platform_slope_4x6x4_blue"))MeshCollision(t.gameObject);
                if(t.name=="floor_arch_1") {
                    var net=t.GetComponentsInChildren<Transform>().FirstOrDefault(x=>x.name.StartsWith("floor_net"));
                    if(net!=null)BoxForArt(net.gameObject);
                }
                if(t.name.StartsWith("spring_pad"))Spring(t.gameObject,t.position.x<35?24f:18f);
                if(t.name.StartsWith("spikeblock_up"))Moving(t.gameObject,Vector3.down*2.8f,3.7f);
                if(t.name.StartsWith("spikeblock_omni"))Moving(t.gameObject,Vector3.down*3.3f,4.2f);
            }
            // These large foreground pieces are scenery; place them behind the runner's plane.
            foreach(var t in authored.Where(t=>t.name.StartsWith("platform_") && t.position.z<-2)) {
                var p=t.position;p.z=-p.z;t.position=p;DisableColliders(t.gameObject);
            }
            var oldSpring=GameObject.Find("BouncePad_H");
            if(oldSpring!=null){var old=oldSpring.GetComponent<BouncePad>();UnityEngine.Object.DestroyImmediate(old);Spring(oldSpring,16f);}
            SetupTrap();
            SplitCollectibles();SplitCrates();SetupBarbarians();SetupFlags();
            session.laterGuidedJumps=session.laterGuidedJumps.Where(x=>x!=39f && x!=24.8f).Concat(new[]{14f,64.5f,77f,84f}).Distinct().ToArray();
            Physics.SyncTransforms();EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
            var ids=session.collectibles.Select(c=>c.collectibleId).OrderBy(x=>x,StringComparer.Ordinal).ToArray();
            File.WriteAllText(WorkspacePaths.Evidence("v8-interaction-content.json"),JsonUtility.ToJson(new Content{ids=ids,stars=session.collectibles.Where(c=>c.isStar).Select(c=>c.collectibleId).OrderBy(x=>x).ToArray(),coins=session.CollectibleCount,springs=UnityEngine.Object.FindObjectsByType<BouncePad>(FindObjectsSortMode.None).Length,barbarians=UnityEngine.Object.FindObjectsByType<EnemyAxeThrower>(FindObjectsSortMode.None).Length},true));
            Debug.Log("Updated V8 in place: "+session.CollectibleCount+" coins, "+session.StarTotal+" stars");
        }
        [Serializable]class Content{public string[] ids,stars;public int coins,springs,barbarians;}
        public static void Capture()
        {
            EditorSceneManager.OpenScene(LevelPlayBuilder.ScenePath);var c=Camera.main;
            foreach(var p in new[]{new Vector2(2,1),new Vector2(14,2.5f),new Vector2(40,5),new Vector2(45,10),new Vector2(61,1),new Vector2(78,1),new Vector2(290,1)}){
                c.GetComponent<FollowCamera>().SnapTo(new Vector3(p.x,p.y,0));
                var rt=new RenderTexture(1280,720,24);c.targetTexture=rt;c.Render();RenderTexture.active=rt;
                var image=new Texture2D(1280,720,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();
                File.WriteAllBytes(WorkspacePaths.Evidence("v8-update-view-"+p.x+".png"),image.EncodeToPNG());
                c.targetTexture=null;RenderTexture.active=null;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(image);
            }
        }
        public static void ApplyAndCapture(){Apply();Capture();}
        static void ConfigureAnimation()
        {
            var skin=session.runner.GetComponentInChildren<VisualSkin>();
            var path=KayKitPilotBuilder.LocalRoot+"/EngineerV8Interactions.controller";
            if(!File.Exists(path))AssetDatabase.CopyAsset(AssetDatabase.GetAssetPath(skin.animationController),path);
            var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(path);var sm=controller.layers[0].stateMachine;
            if(!sm.states.Any(x=>x.state.name=="Walk")) {
                var state=sm.AddState("Walk");state.motion=AssetDatabase.LoadAssetAtPath<AnimationClip>("Assets/KayKit/Characters/Animations/Animations/Rig_Medium/Movement Basic/Walking_A.anim");
            }
            skin.animationController=controller;EditorUtility.SetDirty(controller);
        }
        static void SplitCollectibles()
        {
            var items=new List<Collectible>();var coinId=41;var starId=4;
            foreach(var old in session.collectibles.OrderBy(c=>c.collectibleId)) {
                var visuals=old.GetComponentsInChildren<Renderer>().Where(r=>r.enabled).OrderBy(r=>r.name).ToArray();
                var oldName=old.name;old.name="Archived_"+oldName;
                for(var i=0;i<visuals.Length;i++) {
                    var r=visuals[i];var id=i==0?old.collectibleId:old.isStar?$"s{starId++:00}":$"c{coinId++:00}";
                    var pivot=new GameObject((old.isStar?"Star_":"Coin_")+id).transform;pivot.SetParent(root,false);pivot.position=r.bounds.center;
                    r.transform.SetParent(pivot,true);
                    var c=pivot.gameObject.AddComponent<Collectible>();c.collectibleId=id;c.isStar=old.isStar;items.Add(c);
                }
                old.gameObject.SetActive(false);
            }
            session.collectibles=items.ToArray();
        }
        static void SplitCrates()
        {
            foreach(var old in UnityEngine.Object.FindObjectsByType<BreakableBlock>(FindObjectsSortMode.None)) {
                var visuals=old.GetComponentsInChildren<Renderer>().Where(r=>r.name.StartsWith("KayKit_SupplyCrate")).OrderBy(r=>r.name).ToArray();
                var oldName=old.name;old.name="Archived_"+oldName;
                for(var i=0;i<visuals.Length;i++) {
                    var r=visuals[i];var b=r.bounds;var g=new GameObject(oldName+(i==0?"":"_"+i));g.transform.SetParent(root,false);g.transform.position=b.center;
                    r.transform.SetParent(g.transform,true);g.AddComponent<BoxCollider>().size=b.size;
                    g.AddComponent<BreakableBlock>().grantsAxes=old.grantsAxes;
                    if(old.grantsAxes){var emblem=UnityEngine.Object.Instantiate(session.runner.GetComponent<AxeWeapon>().axePrefab,g.transform);emblem.name="AxeEmblem";emblem.transform.localPosition=new Vector3(0,0,-.62f);emblem.transform.localScale=Vector3.one*.55f;}
                }
                old.gameObject.SetActive(false);
            }
        }
        static void SetupBarbarians()
        {
            var models=UnityEngine.Object.FindObjectsByType<Animator>(FindObjectsSortMode.None).Where(a=>a.name.StartsWith("Barbarian")).ToArray();
            foreach(var model in models) {
                var b=BoundsOf(model.gameObject);var g=new GameObject("AxeBarbarian_"+model.name);g.transform.SetParent(root,false);
                g.transform.position=new Vector3(model.transform.position.x,b.min.y+.9f,0);model.transform.SetParent(g.transform,true);
                Paint(model.gameObject,characters);DisableColliders(model.gameObject);
                model.runtimeAnimatorController=session.runner.GetComponentInChildren<VisualSkin>().animationController;model.applyRootMotion=false;
                var p=g.AddComponent<PatrolEnemy>();p.session=session;p.leftX=g.transform.position.x-.55f;p.rightX=g.transform.position.x+.55f;p.speed=.5f;p.hitRadius=.7f;
                var sphere=g.AddComponent<SphereCollider>();sphere.radius=.7f;sphere.isTrigger=true;
                var thrower=g.AddComponent<EnemyAxeThrower>();thrower.session=session;thrower.axePrefab=session.runner.GetComponent<AxeWeapon>().axePrefab;
            }
            var old=GameObject.Find("PatrolBarbarian");if(old!=null){old.GetComponent<PatrolEnemy>().enabled=false;old.SetActive(false);}
        }
        static void SetupFlags()
        {
            var original=GameObject.Find("flag_C_blue");var flags=new List<CheckpointFlag>();
            var positions=new[]{original.transform.position,new Vector3(136,0,0),new Vector3(231,1,0),new Vector3(332,0,0)};
            for(var i=0;i<positions.Length;i++) {
                var g=i==0?original:UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(Pack+"blue/flag_C_blue.prefab"),root);
                g.name=i==0?"flag_C_blue":"flag_C_blue_Checkpoint_"+(i+1);g.transform.position=positions[i];Paint(g,kit);DisableColliders(g);
                var filter=g.GetComponentInChildren<MeshFilter>();var path=KayKitPilotBuilder.LocalRoot+"/CheckpointCloth.asset";
                var mesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if(mesh==null){var source=filter.sharedMesh;mesh=new Mesh{name="CheckpointCloth",vertices=source.vertices,normals=source.normals,uv=source.uv,subMeshCount=source.subMeshCount};for(var n=0;n<source.subMeshCount;n++)mesh.SetIndices(source.GetIndices(n),source.GetTopology(n),n);mesh.RecalculateBounds();AssetDatabase.CreateAsset(mesh,path);}
                filter.sharedMesh=mesh;
                var flag=g.AddComponent<CheckpointFlag>();flag.session=session;flag.respawnPoint=positions[i]+Vector3.up*1.1f;flags.Add(flag);
            }
            session.checkpointFlags=flags.ToArray();session.checkpoint=flags[0].respawnPoint;session.laterCheckpoints=flags.Skip(1).Select(f=>f.respawnPoint).ToArray();
        }
        static void SetupTrap()
        {
            var g=GameObject.Find("floor_spikes_trap_4x4x1_yellow");DisableColliders(g);
            var spikes=g.GetComponentsInChildren<Transform>().First(t=>t.name.Contains("trap_spikes"));
            var b=BoundsOf(spikes.gameObject);var shape=spikes.gameObject.AddComponent<BoxCollider>();shape.isTrigger=true;
            shape.center=spikes.InverseTransformPoint(b.center);shape.size=b.size*.85f;
            var trap=g.AddComponent<SpikeTrap>();trap.session=session;trap.spikes=spikes;trap.danger=shape;
            var old=GameObject.Find("Hazard_KayKitOpeningSpikes");if(old!=null)old.SetActive(false);
            var oldArt=GameObject.Find("KayKit_KayKitOpeningSpikes");if(oldArt!=null)oldArt.SetActive(false);
        }
        static void Spring(GameObject model,float force)
        {
            var b=BoundsOf(model);var pivot=new GameObject("Spring_"+model.name);pivot.transform.SetParent(root,false);pivot.transform.position=new Vector3(b.center.x,b.max.y,0);
            model.transform.SetParent(pivot.transform,true);DisableColliders(model);
            var shape=pivot.AddComponent<BoxCollider>();shape.center=Vector3.down*.1f;shape.size=new Vector3(b.size.x,.2f,b.size.z);
            var spring=pivot.AddComponent<BouncePad>();spring.session=session;spring.visual=model.transform;spring.upwardSpeed=force;spring.halfWidth=b.size.x*.5f+.12f;
        }
        static void Moving(GameObject model,Vector3 travel,float period)
        {
            var b=BoundsOf(model);var pivot=new GameObject("Motion_"+model.name);pivot.transform.SetParent(root,false);pivot.transform.position=b.center;
            model.transform.SetParent(pivot.transform,true);DisableColliders(model);var shape=pivot.AddComponent<BoxCollider>();shape.size=b.size*.85f;shape.isTrigger=true;
            var motion=pivot.AddComponent<MovingHazard>();motion.session=session;motion.travel=travel;motion.period=period;
        }
        static GameObject Art(string id,string name,Vector3 center,Vector3 size)
            =>ProductLevelBuilder.Visual(AssetDatabase.LoadAssetAtPath<GameObject>(Pack+id+".prefab"),root,name,kit,new Bounds(center,size));
        static void Paint(GameObject g,Material m){foreach(var r in g.GetComponentsInChildren<Renderer>())r.sharedMaterials=r.sharedMaterials.Select(_=>m).ToArray();}
        static void DisableColliders(GameObject g){foreach(var c in g.GetComponentsInChildren<Collider>())c.enabled=false;}
        static Bounds BoundsOf(GameObject g){var rs=g.GetComponentsInChildren<Renderer>().Where(r=>r.enabled).ToArray();var b=rs[0].bounds;foreach(var r in rs.Skip(1))b.Encapsulate(r.bounds);return b;}
        static void MeshCollision(GameObject g){DisableColliders(g);foreach(var f in g.GetComponentsInChildren<MeshFilter>()){var c=f.gameObject.AddComponent<MeshCollider>();c.sharedMesh=f.sharedMesh;}}
        static void BoxForArt(GameObject g){var b=BoundsOf(g);var box=g.AddComponent<BoxCollider>();box.center=g.transform.InverseTransformPoint(b.center);var s=g.transform.lossyScale;box.size=new Vector3(b.size.x/s.x,b.size.y/s.y,b.size.z/s.z);}
        static void FitBox(BoxCollider box,Bounds b){box.transform.position=b.center;box.transform.localScale=Vector3.one;box.center=Vector3.zero;box.size=b.size;}
    }
}
