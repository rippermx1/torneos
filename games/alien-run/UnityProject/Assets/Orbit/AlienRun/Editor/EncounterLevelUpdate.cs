using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using Object=UnityEngine.Object;

namespace Orbit.AlienRun.Editor
{
    // Updates the saved V8; does not reconstruct terrain or overwrite the vendor library.
    public static class EncounterLevelUpdate
    {
        static RunSession session;
        static Transform enemies,hazards,traversal,scenery;
        static GameObject Piece(string source,string name,Transform parent,Vector3 position,Vector3 size)
        {
            var g=(GameObject)PrefabUtility.InstantiatePrefab(GameplayKitBuilder.Load(source));
            g.name=name;g.transform.SetParent(parent,false);g.transform.position=position;
            var n=g.GetComponent<GameElement>().nativeSize;
            g.transform.localScale=new Vector3(size.x/n.x,size.y/n.y,size.z/n.z);
            foreach(var d in g.GetComponentsInChildren<ContactDanger>())d.session=session;
            return g;
        }
        static Rigidbody Body(GameObject g)
        {
            var b=g.GetComponent<Rigidbody>();if(b==null)b=g.AddComponent<Rigidbody>();
            b.isKinematic=true;b.useGravity=false;b.interpolation=RigidbodyInterpolation.Interpolate;
            b.collisionDetectionMode=CollisionDetectionMode.ContinuousSpeculative;
            return b;
        }
        static Bounds LocalBounds(GameObject g,Transform relative)
        {
            var bounds=new Bounds();var first=true;
            foreach(var f in g.GetComponentsInChildren<MeshFilter>())if(f.sharedMesh!=null){
                var b=f.sharedMesh.bounds;
                foreach(var x in new[]{b.min.x,b.max.x})foreach(var y in new[]{b.min.y,b.max.y})foreach(var z in new[]{b.min.z,b.max.z}){
                    var p=relative.InverseTransformPoint(f.transform.TransformPoint(new Vector3(x,y,z)));
                    if(first){bounds=new Bounds(p,Vector3.zero);first=false;}else bounds.Encapsulate(p);
                }
            }
            return bounds;
        }
        static void FitDanger(GameObject g)
        {
            var box=g.GetComponent<BoxCollider>();if(box==null)return;
            var b=LocalBounds(g,g.transform);box.center=b.center;
            box.size=Vector3.Scale(b.size,new Vector3(.86f,.9f,.86f));box.isTrigger=true;
        }
        static void Warning(float x,string name)
        {
            var g=Piece("signage_arrow_stand_red",name,scenery,new Vector3(x,1,2.5f),new Vector3(1.2f,2,.3f));
            foreach(var c in g.GetComponentsInChildren<Collider>())c.enabled=false;
            g.transform.Find("Visual").Rotate(0,180,0);
        }
        static void NewEnemy(string model,string name,float x,float left,float right,float speed,bool ranged)
        {
            var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(GameplayKitBuilder.Library+"/AR_Enemy_"+model+".prefab");
            var g=(GameObject)PrefabUtility.InstantiatePrefab(prefab);g.transform.SetParent(enemies,false);
            g.name=name;g.transform.position=new Vector3(x,.9f,0);ConfigureEnemy(g,left,right,speed,ranged);
        }
        static void UpdateActorPrefab(string model,bool ranged)
        {
            var path=GameplayKitBuilder.Library+"/AR_Enemy_"+model+".prefab";
            var root=PrefabUtility.LoadPrefabContents(path);
            var cap=root.GetComponent<CapsuleCollider>();cap.center=Vector3.zero;cap.height=1.8f;cap.radius=.36f;cap.isTrigger=true;Body(root);
            var actor=root.GetComponent<PatrolEnemy>();actor.session=null;actor.leftX=0;actor.rightX=4;actor.speed=ranged?2.5f:3f;
            if(ranged){var t=root.GetComponent<EnemyAxeThrower>();t.session=null;t.range=9;t.cooldown=2.25f;t.windup=.65f;t.recovery=.32f;}
            else {var m=root.GetComponent<EnemyMeleeAttack>();if(m==null)m=root.AddComponent<EnemyMeleeAttack>();m.session=null;}
            PrefabUtility.SaveAsPrefabAsset(root,path);PrefabUtility.UnloadPrefabContents(root);
        }
        static void ConfigureEnemy(GameObject g,float left,float right,float speed,bool ranged)
        {
            var p=g.GetComponent<PatrolEnemy>();p.session=session;p.leftX=left;p.rightX=right;p.speed=speed;
            var animator=g.GetComponentInChildren<Animator>();if(animator!=null)animator.transform.rotation=Quaternion.Euler(0,90,0);
            var cap=g.GetComponent<CapsuleCollider>();cap.center=Vector3.zero;cap.height=1.8f;cap.radius=.36f;cap.direction=1;cap.isTrigger=true;
            Body(g);
            if(ranged){var t=g.GetComponent<EnemyAxeThrower>();t.session=session;t.range=9;t.cooldown=2.25f;t.windup=.65f;t.recovery=.32f;}
            else {var m=g.GetComponent<EnemyMeleeAttack>();if(m==null)m=g.AddComponent<EnemyMeleeAttack>();m.session=session;m.detectionRange=2.6f;m.reach=1.8f;m.windup=.45f;m.activeSeconds=.16f;m.recovery=.5f;m.cooldown=1.7f;}
        }
        static void Trap(float x,float phase)
        {
            var path=GameplayKitBuilder.Library+"/AR_Trap_Retractable.prefab";
            if(!File.Exists(path)){
                var temp=Object.Instantiate(GameplayKitBuilder.Load("floor_spikes_trap_2x2x1_red"));temp.name="AR_Trap_Retractable";
                var spikes=temp.GetComponentsInChildren<Transform>().First(t=>t.name.Contains("trap_spikes"));
                var box=spikes.gameObject.AddComponent<BoxCollider>();var b=LocalBounds(spikes.gameObject,spikes);box.center=b.center;box.size=b.size*.86f;box.isTrigger=true;
                var script=temp.AddComponent<SpikeTrap>();script.spikes=spikes;script.danger=box;script.retractDistance=b.size.y*1.1f;
                PrefabUtility.SaveAsPrefabAsset(temp,path);Object.DestroyImmediate(temp);
            }
            var asset=AssetDatabase.LoadAssetAtPath<GameObject>(path);var g=(GameObject)PrefabUtility.InstantiatePrefab(asset);
            g.name="Encounter_Trap_"+x;g.transform.SetParent(hazards,false);var size=g.GetComponent<GameElement>().nativeSize;
            g.transform.localScale=new Vector3(1.7f/size.x,1.4f/size.y,2/size.z);g.transform.position=new Vector3(x,0,0);
            var t=g.GetComponent<SpikeTrap>();t.session=session;t.period=3.8f;t.phaseOffset=phase;
            Warning(x-2.7f,"Encounter_Warning_Trap_"+x);
        }
        static void Crusher(float x,float period,float phase)
        {
            var g=Piece("spikeblock_down_red","Encounter_Crusher_"+x,hazards,new Vector3(x,6,0),new Vector3(1.6f,2,1.8f));
            FitDanger(g);g.GetComponent<ContactDanger>().enabled=false;Body(g);
            var m=g.AddComponent<MovingHazard>();m.session=session;m.travel=Vector3.down*4.7f;m.period=period;m.phase=phase;
            Warning(x-3,"Encounter_Warning_Crusher_"+x);
        }
        static void Roller()
        {
            var g=Piece("spikeroller_horizontal","Encounter_Roller_Blue",hazards,new Vector3(48.2f,.75f,0),new Vector3(1.2f,1.4f,1.5f));
            Object.DestroyImmediate(g.GetComponent<BoxCollider>());
            var c=g.AddComponent<SphereCollider>();c.radius=.55f/Mathf.Max(g.transform.lossyScale.x,g.transform.lossyScale.y,g.transform.lossyScale.z);
            c.isTrigger=true;g.GetComponent<ContactDanger>().enabled=false;Body(g);
            var m=g.AddComponent<MovingHazard>();m.session=session;m.travel=Vector3.right*1.6f;m.period=2.8f;
            g.transform.Find("Visual").gameObject.AddComponent<VisualSpinner>().degreesPerSecond=240;
            Warning(45.5f,"Encounter_Warning_Roller");
        }
        static void Pendulum()
        {
            var asset=GameplayKitBuilder.Load("sawblade");var g=(GameObject)PrefabUtility.InstantiatePrefab(asset);
            g.name="Encounter_Pendulum_Bridge";g.transform.SetParent(hazards,false);var n=g.GetComponent<GameElement>().nativeSize;
            g.transform.localScale=new Vector3(1.5f/n.x,.22f/n.y,1.5f/n.z);g.transform.rotation=Quaternion.Euler(90,0,0);
            g.transform.position=new Vector3(61,5.1f,0);Object.DestroyImmediate(g.GetComponent<BoxCollider>());
            var c=g.AddComponent<SphereCollider>();c.radius=.62f/Mathf.Max(g.transform.lossyScale.x,g.transform.lossyScale.y,g.transform.lossyScale.z);c.isTrigger=true;
            Body(g);g.GetComponent<ContactDanger>().session=session;
            var p=g.AddComponent<PendulumHazard>();p.session=session;p.pivot=new Vector3(61,7.1f,0);p.length=2;p.angle=40;p.period=3.8f;
            var chain=Piece("chain_full","Encounter_Pendulum_Chain",scenery,new Vector3(61,6.1f,0),new Vector3(.18f,2,.18f));
            foreach(var shape in chain.GetComponentsInChildren<Collider>())shape.enabled=false;p.suspension=chain.transform;
            Piece("arch_wide_blue","Encounter_Pendulum_Anchor",scenery,new Vector3(61,3.65f,.4f),new Vector3(6,7.3f,1));
            g.transform.Find("Visual").gameObject.AddComponent<VisualSpinner>().degreesPerSecond=320;
        }
        static void GoldReward(Collectible old)
        {
            var p=old.transform.position;var id=old.collectibleId;var oldName=old.name;
            var g=Piece("star_yellow",oldName,old.transform.parent,p,new Vector3(1.1f,1.1f,.4f));
            var c=g.GetComponent<Collectible>();c.collectibleId=id;c.isStar=true;
            var index=Array.IndexOf(session.collectibles,old);session.collectibles[index]=c;Object.DestroyImmediate(old.gameObject);
        }
        public static void Apply()
        {
            var scene=EditorSceneManager.OpenScene(LevelPlayBuilder.ScenePath);session=Object.FindFirstObjectByType<RunSession>();
            var root=GameObject.Find("V8_CompleteCourse").transform;
            enemies=root.Find("Enemies");hazards=root.Find("Hazards");traversal=root.Find("Traversal");scenery=root.Find("Scenery");
            foreach(var t in root.GetComponentsInChildren<Transform>().Where(t=>t.name.StartsWith("Encounter_")).OrderByDescending(t=>t.childCount).ToArray())if(t!=null)Object.DestroyImmediate(t.gameObject);
            var controller=(AnimatorController)GameplayKitBuilder.EnemyController();var sm=controller.layers[0].stateMachine;
            var attack=sm.states.Select(s=>s.state).FirstOrDefault(s=>s.name=="Attack")??sm.AddState("Attack");
            attack.motion=AssetDatabase.LoadAssetAtPath<AnimationClip>("Assets/KayKit/Characters/Animations/Animations/Rig_Medium/Combat Melee/Melee_1H_Attack_Slice_Horizontal.anim");
            EditorUtility.SetDirty(controller);
            UpdateActorPrefab("Barbarian",true);UpdateActorPrefab("Rogue",false);
            ConfigureEnemy(GameObject.Find("Barbarian_108"),105.5f,110,2.4f,true);
            ConfigureEnemy(GameObject.Find("Walker_128"),128.5f,131.3f,3.2f,false);
            ConfigureEnemy(GameObject.Find("Barbarian_208"),206,210.2f,2.7f,true);
            NewEnemy("Rogue","Encounter_Rogue_Tutorial",12.8f,11.6f,14.8f,2.6f,false);
            NewEnemy("Rogue","Encounter_Rogue_Bridge",63,61.5f,64.3f,2.8f,false);
            NewEnemy("Barbarian","Encounter_Barbarian_Blue",86,84.5f,88,2.4f,true);
            NewEnemy("Barbarian","Encounter_Barbarian_Red",146,144.5f,148,2.6f,true);
            NewEnemy("Rogue","Encounter_Rogue_Red",187.5f,186.6f,189.5f,3.3f,false);
            NewEnemy("Barbarian","Encounter_Barbarian_Goal",236,234.6f,237.8f,2.7f,true);
            Trap(101,0);Trap(185.5f,.55f);Trap(202,1.1f);Crusher(124,4.2f,.3f);Crusher(215,4.0f,.6f);Roller();Pendulum();
            Piece("platform_4x4x2_yellow","Encounter_Hurdle_Yellow",traversal,new Vector3(10.4f,.6f,0),new Vector3(1.2f,.6f,2.6f));
            Piece("platform_4x4x2_blue","Encounter_Hurdle_Blue",traversal,new Vector3(75,.6f,0),new Vector3(1.2f,.6f,2.6f));
            Piece("platform_4x4x2_red","Encounter_Landing_Red",traversal,new Vector3(183.65f,1.1f,0),new Vector3(1.3f,1.1f,4));
            foreach(var star in session.collectibles.Where(c=>c.isStar).ToArray())GoldReward(star);
            foreach(var pad in Object.FindObjectsByType<BouncePad>(FindObjectsSortMode.None)){
                if(!pad.name.StartsWith("Spring_"))continue;
                var b=GameplayKitBuilder.BoundsOf(pad.gameObject);var old=pad.gameObject;
                var g=Piece("spring_pad_yellow",old.name,old.transform.parent,old.transform.position,b.size);
                var bounce=g.GetComponent<BouncePad>();bounce.session=session;bounce.upwardSpeed=13;bounce.halfWidth=b.size.x*.5f;
                Object.DestroyImmediate(old);
            }
            foreach(var h in Object.FindObjectsByType<MovingHazard>(FindObjectsSortMode.None))FitDanger(h.gameObject);
            foreach(var d in Object.FindObjectsByType<ContactDanger>(FindObjectsSortMode.None))if(d.GetComponent<PendulumHazard>()==null)FitDanger(d.gameObject);
            var skies=scenery.GetComponentsInChildren<Transform>().Where(t=>t.name.StartsWith("Sky_Texture_")).OrderBy(t=>t.name).ToArray();
            var sky=skies[0];foreach(var repeated in skies.Skip(1))Object.DestroyImmediate(repeated.gameObject);
            var backdrop=sky.GetComponent<SkyBackdrop>();if(backdrop==null)backdrop=sky.gameObject.AddComponent<SkyBackdrop>();backdrop.Refresh();
            var guide=session.GetComponent<PracticeNavigator>();guide.jumps=new[]{6.8f,9.2f,24.4f,33.6f,45.7f,67.3f,73.7f,98.6f,112.3f,116.8f,126.4f,129.6f,134.3f,149.6f,177.1f,183.3f,199.6f,223.5f,228.7f};
            foreach(var component in root.GetComponentsInChildren<Component>(true))
                if(component!=null && PrefabUtility.IsPartOfPrefabInstance(component))
                    PrefabUtility.RecordPrefabInstancePropertyModifications(component);
            Physics.SyncTransforms();EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
            var actors=Object.FindObjectsByType<PatrolEnemy>(FindObjectsSortMode.None);
            var data=new Audit{enemyCount=actors.Length,throwers=Object.FindObjectsByType<EnemyAxeThrower>(FindObjectsSortMode.None).Length,
                melee=Object.FindObjectsByType<EnemyMeleeAttack>(FindObjectsSortMode.None).Length,
                traps=Object.FindObjectsByType<SpikeTrap>(FindObjectsSortMode.None).Length,
                movingHazards=Object.FindObjectsByType<MovingHazard>(FindObjectsSortMode.None).Length,
                enemies=actors.Select(p=>new ActorData{name=p.name,left=p.leftX,right=p.rightX,speed=p.speed}).ToArray()};
            File.WriteAllText(WorkspacePaths.Evidence("encounters-level-content.json"),JsonUtility.ToJson(data,true));
            Capture();Debug.Log("V8 encounter update: "+actors.Length+" enemies, "+data.traps+" spike traps");
        }
        [Serializable]class Audit{public int enemyCount,throwers,melee,traps,movingHazards;public ActorData[] enemies;}
        [Serializable]class ActorData{public string name;public float left,right,speed;}
        public static void Capture()
        {
            var camera=Camera.main;
            foreach(var x in new[]{12,49,65,101,124,146,185,202,215,236}){
                camera.GetComponent<FollowCamera>().SnapTo(new Vector3(x,1,0));Object.FindFirstObjectByType<SkyBackdrop>().Refresh();var rt=new RenderTexture(1280,720,24);
                camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;var image=new Texture2D(1280,720,TextureFormat.RGB24,false);
                image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();File.WriteAllBytes(WorkspacePaths.Evidence("encounters-sector-"+x+".png"),image.EncodeToPNG());
                camera.targetTexture=null;RenderTexture.active=null;Object.DestroyImmediate(rt);Object.DestroyImmediate(image);
            }
        }
    }
}
