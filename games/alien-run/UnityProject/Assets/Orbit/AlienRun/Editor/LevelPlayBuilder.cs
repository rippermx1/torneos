using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Orbit.AlienRun.Editor
{
    public static class LevelPlayBuilder
    {
        public const string ScenePath = KayKitPilotBuilder.LocalRoot + "/AlienRunProductLevelV8.unity";
        public const int ExpectedCoins = 40;
        public const int ExpectedStars = 3;
        const string Pack="Assets/KayKit/Packs/KayKit - Platformer Pack (for Unity)/Prefabs/";
        const string Characters="Assets/KayKit/Characters/KayKit - Adventurers (for Unity)/Prefabs/";
        static Transform root;
        static Material kit, adventurer;
        static RunSession session;
        public static void CreateAndCapture() {Create();Capture();}
        public static void Create()
        {
            if(File.Exists(ScenePath)) throw new InvalidOperationException("V8 ya existe; no se sobrescribe.");
            var scene=EditorSceneManager.OpenScene(ProductLevelV7Builder.ScenePath,OpenSceneMode.Single);
            session=UnityEngine.Object.FindFirstObjectByType<RunSession>();
            root=new GameObject("LevelPlayV8").transform;
            kit=ProductLevelBuilder.LoadMaterial("PlatformerURP");
            adventurer=ProductLevelBuilder.LoadMaterial("EngineerURP");
            // Only obsolete generated decoration is removed. User placements are adopted below.
            foreach(var t in UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsInactive.Include,FindObjectsSortMode.None))
                if(t != null && (t.name.StartsWith("FloorRim") || t.name=="Back_Ridge" ||
                    t.name.StartsWith("FarHill") || t.name.StartsWith("NearHill")))
                    UnityEngine.Object.DestroyImmediate(t.gameObject);

            var slope=GameObject.Find("platform_slope_4x6x4_yellow");
            if(slope==null) throw new InvalidOperationException("Falta la rampa editada por el usuario.");
            Paint(slope,kit); MeshCollision(slope);
            var userSpike=GameObject.Find("spikeblock_double_vertical_yellow");
            if(userSpike==null) throw new InvalidOperationException("Falta el obstáculo editado por el usuario.");
            Paint(userSpike,kit); DisableColliders(userSpike);
            AddMovingShape(userSpike,new Vector3(0,4f,0),3.8f);

            // Every visible coin gets its own centered transform, ID and collection point.
            var coins=new List<Collectible>();
            var extraId=25;
            foreach(var old in session.collectibles.OrderBy(c=>c.collectibleId))
            {
                var visuals=old.GetComponentsInChildren<Renderer>(true).Where(r=>r.name.StartsWith("CoinVisual")).OrderBy(r=>r.name).ToArray();
                if(visuals.Length==0) { coins.Add(old); continue; }
                for(var i=0;i<visuals.Length;i++)
                {
                    var v=visuals[i].transform;
                    var id=i==0?old.collectibleId:$"c{extraId++:00}";
                    var pivot=new GameObject("Coin_"+id).transform; pivot.SetParent(root,false);pivot.position=visuals[i].bounds.center;
                    v.SetParent(pivot,true);
                    var c=pivot.gameObject.AddComponent<Collectible>();c.collectibleId=id;coins.Add(c);
                }
                old.gameObject.SetActive(false);
            }
            // Preserve the user's red star and its position, with two further optional rewards.
            var star=GameObject.Find("star_red");
            if(star==null) throw new InvalidOperationException("Falta la estrella del usuario.");
            Paint(star,kit);DisableColliders(star);
            coins.Add(AdoptStar(star,"s01"));
            coins.Add(AdoptStar(Art("red/star_red","Star_UpperWorkshop",new Vector3(151f,4.65f,0),Vector3.one*1.15f),"s02"));
            coins.Add(AdoptStar(Art("red/star_red","Star_SpringRoute",new Vector3(307f,5.1f,0),Vector3.one*1.15f),"s03"));

            // Match colliders to upper platforms whose art was moved manually.
            foreach(var t in UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))
                if(t.name.StartsWith("Upper_") && t.TryGetComponent<BoxCollider>(out var box))
                {
                    var visual=GameObject.Find("KayKit_"+t.name);
                    if(visual==null) continue;
                    var b=BoundsOf(visual); t.position=b.center; t.localScale=Vector3.one;
                    box.center=Vector3.zero;box.size=b.size;
                }
            // Solid colored bases with real depth replace the uniform wooden strip.
            foreach(var t in UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))
                if(t.name.StartsWith("KayKit_Ground_")) UnityEngine.Object.DestroyImmediate(t.gameObject);
            var grounds=UnityEngine.Object.FindObjectsByType<BoxCollider>(FindObjectsSortMode.None).Where(c=>c.name.StartsWith("Ground_")).OrderBy(c=>c.transform.position.x).ToArray();
            var colors=new[]{"yellow","yellow","green","green","blue","blue","yellow","red","red"};
            for(var j=0;j<grounds.Length;j++)
            {
                var g=grounds[j];var b=g.bounds;var color=colors[Mathf.Min(j,colors.Length-1)];
                var count=Mathf.CeilToInt(b.size.x/4f);var width=b.size.x/count;
                for(var i=0;i<count;i++)
                    Art(color+"/platform_4x4x2_"+color,"Base_"+j+"_"+i,
                        new Vector3(b.min.x+(i+.5f)*width,-1.5f,0),new Vector3(width,3f,4f));
            }
            Terrace(89f,1.2f,"green",coins);
            Terrace(161f,.8f,"blue",coins);
            Terrace(227f,1f,"yellow",coins);
            Terrace(275f,1.5f,"red",coins);
            // Small stacked blocks provide reachable choices before the taller bridges.
            Solid("yellow/platform_2x2x1_yellow","Step_Branch",new Vector3(26.8f,.45f,0),new Vector3(2f,.9f,3f));
            Solid("blue/platform_2x2x1_blue","Step_Workshop",new Vector3(138.5f,.5f,0),new Vector3(2f,1f,3f));
            Solid("red/platform_2x2x1_red","Step_Spring",new Vector3(293f,.5f,0),new Vector3(2f,1f,3f));

            // Breakable supply boxes are clear overhead targets; the first teaches the action.
            var weapon=session.runner.gameObject.GetComponent<AxeWeapon>();
            if(weapon==null)weapon=session.runner.gameObject.AddComponent<AxeWeapon>();
            weapon.axePrefab=CreateAxePrefab();
            foreach(var x in new[]{0f,27f,132f,230f,332f}) SupplyBox(x,x==230f?4.4f:3.4f,true);
            foreach(var x in new[]{31f,35f,140f,144f,296f}) SupplyBox(x,5.6f,false);
            ConfigureThrowAnimation();

            // Adopt the user's Barbarian as a patrol enemy, with the imported idle/run rig.
            var barbarian=GameObject.Find("Barbarian");
            if(barbarian!=null)
            {
                Paint(barbarian,adventurer);DisableColliders(barbarian);
                var pivot=new GameObject("PatrolBarbarian").transform;pivot.SetParent(root,false);
                pivot.position=new Vector3(barbarian.transform.position.x,1f,0f);barbarian.transform.SetParent(pivot,true);
                var enemy=pivot.gameObject.AddComponent<PatrolEnemy>();enemy.session=session;enemy.leftX=42f;enemy.rightX=45f;enemy.hitRadius=.75f;enemy.speed=1.1f;
                var animator=barbarian.GetComponentInChildren<Animator>();
                if(animator!=null) animator.runtimeAnimatorController=session.runner.GetComponentInChildren<VisualSkin>().animationController;
            }
            foreach(var enemy in UnityEngine.Object.FindObjectsByType<PatrolEnemy>(FindObjectsSortMode.None))
            {
                var collider=enemy.gameObject.GetComponent<SphereCollider>();
                if(collider==null)collider=enemy.gameObject.AddComponent<SphereCollider>();
                collider.isTrigger=true;collider.radius=enemy.hitRadius;
            }
            var hammer=Art("red/spikeblock_double_vertical_red","Crusher_UpperRoute",new Vector3(146.5f,9.2f,0),new Vector3(1.6f,2.1f,2f));
            AddMovingShape(hammer,Vector3.down*4f,4f);
            var roller=Art("neutral/spikeball","PitLift_Spikes",new Vector3(128f,-2.5f,0),Vector3.one*1.7f);
            AddMovingShape(roller,Vector3.up*1.4f,2.6f);
            var hanging=Art("neutral/spikeball_hanger","HangingBall",new Vector3(255f,6.2f,0),new Vector3(1.7f,2.4f,1.7f));
            AddMovingShape(hanging,new Vector3(2.5f,0,0),3.4f);

            // Architectural scenery: discrete structures and stacked bases, behind each zone.
            foreach(var x in new[]{40f,112f,152f,203f,260f,307f,346f})
            {
                Art("neutral/pillar_2x2x4","BackdropPillar_"+x,new Vector3(x,-.8f,5.8f),new Vector3(1.1f,4f,1.1f));
                Art("neutral/strut_horizontal","BackdropBeam_"+x,new Vector3(x,1.1f,5.8f),new Vector3(5.5f,.35f,.4f));
                Art("neutral/barrier_3x1x1","BackdropFence_"+x,new Vector3(x+4f,.4f,4.5f),new Vector3(2.7f,.8f,.4f));
            }
            // Additional coin trails make both ascent and landing direction explicit.
            var gold=ProductLevelBuilder.LoadMaterial("LevelOneGold");
            foreach(var p in new[]{new Vector2(91f,2.3f),new Vector2(94f,2.5f),new Vector2(98f,1.9f),
                new Vector2(164f,2.1f),new Vector2(169f,1.8f),new Vector2(229f,2.2f),
                new Vector2(234f,2.1f),new Vector2(278f,2.8f),new Vector2(282f,2.3f)})
                ProductLevelBuilder.Coin(root,coins,$"c{extraId++:00}",p.x,p.y,gold);
            session.collectibles=coins.ToArray();session.requiredCollectibles=12;
            if(coins.Count(c=>!c.isStar)!=ExpectedCoins || coins.Count(c=>c.isStar)!=ExpectedStars)
                throw new InvalidOperationException("El inventario jugable no coincide con el contrato V8.");
            session.laterCheckpoints=new[]{new Vector3(136,2,0),new Vector3(231,3,0),new Vector3(332,2,0)};
            var jumps=new List<float>(session.laterGuidedJumps){8f,39f,24.8f,136f,290.5f};
            session.laterGuidedJumps=jumps.ToArray();
            FitSky();
            AddArchFootings();
            EditorSceneManager.MarkSceneDirty(scene);
            if(!EditorSceneManager.SaveScene(scene,ScenePath)) throw new IOException("No se pudo guardar V8.");
            AssetDatabase.SaveAssets();
            File.WriteAllText("C:/play-games/evidence/level-v8-content.json",
                JsonUtility.ToJson(new Content{coins=coins.Count(c=>!c.isStar),stars=coins.Count(c=>c.isStar),ids=coins.Select(c=>c.collectibleId).ToArray()},true));
            Debug.Log("V8 saved, coins="+coins.Count(c=>!c.isStar)+", stars=3");
        }
        [Serializable] class Content {public int coins,stars;public string[] ids;}
        public static void Polish()
        {
            var scene=EditorSceneManager.OpenScene(ScenePath,OpenSceneMode.Single);
            root=GameObject.Find("LevelPlayV8").transform;kit=ProductLevelBuilder.LoadMaterial("PlatformerURP");
            var crusher=GameObject.Find("Crusher_UpperRoute_Motion");
            crusher.transform.position=new Vector3(146.5f,9.2f,0);
            crusher.GetComponent<MovingHazard>().travel=Vector3.down*4f;
            crusher.GetComponent<MovingHazard>().period=4f;
            foreach(var t in UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))
            {
                // Recess buried ramp faces slightly behind the base to avoid coplanar flickering.
                if(t.name.StartsWith("RampUp_")||t.name.StartsWith("RampDown_")) {
                    var scale=t.localScale;scale.z*=3.9f/BoundsOf(t.gameObject).size.z;t.localScale=scale;
                }
            }
            AddArchFootings();
            EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);
            Capture();
        }
        public static void Capture()
        {
            EditorSceneManager.OpenScene(ScenePath,OpenSceneMode.Single);
            var camera=Camera.main;
            foreach(var x in new[]{14f,94f,146f,255f,307f}) {
                camera.transform.position=new Vector3(x,6.7f,-16f);
                camera.transform.LookAt(new Vector3(x,1.7f,0));
                var rt=new RenderTexture(1280,720,24);camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;
                var image=new Texture2D(1280,720,TextureFormat.RGB24,false);
                image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();
                File.WriteAllBytes("C:/play-games/evidence/level-v8-sector-"+x+".png",image.EncodeToPNG());
                camera.targetTexture=null;RenderTexture.active=null;
                UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(image);
            }
        }
        static Collectible AdoptStar(GameObject star,string id)
        {
            var pivot=new GameObject("Star_"+id).transform;pivot.SetParent(root,false);pivot.position=BoundsOf(star).center;
            star.transform.SetParent(pivot,true);var c=pivot.gameObject.AddComponent<Collectible>();c.isStar=true;c.collectibleId=id;return c;
        }
        static void Terrace(float x,float height,string color,List<Collectible> coins)
        {
            // Native slope rises in local Z; rotate to run along world X.
            var up=Art(color+"/platform_slope_4x6x4_"+color,"RampUp_"+x,
                new Vector3(x+1.5f,0,0),new Vector3(3f,height*2f,3.9f),Quaternion.Euler(0,270,0));
            MeshCollision(up);
            Solid(color+"/platform_4x4x2_"+color,"Terrace_"+x,new Vector3(x+5f,height*.5f,0),new Vector3(4f,height,4f));
            var down=Art(color+"/platform_slope_4x6x4_"+color,"RampDown_"+x,
                new Vector3(x+8.5f,0,0),new Vector3(3f,height*2f,3.9f),Quaternion.Euler(0,90,0));MeshCollision(down);
            foreach(var c in coins.Where(c=>!c.isStar && c.transform.position.x>=x && c.transform.position.x<=x+10 && c.transform.position.y<2f))
                c.transform.position+=Vector3.up*height;
        }
        static void SupplyBox(float x,float y,bool reward)
        {
            var g=GameObject.CreatePrimitive(PrimitiveType.Cube);g.name="SupplyBox_"+x;g.transform.SetParent(root,false);
            g.transform.position=new Vector3(x,y,0);g.transform.localScale=Vector3.one;
            g.GetComponent<MeshRenderer>().enabled=false;
            var visual=ProductLevelBuilder.Visual(AssetDatabase.LoadAssetAtPath<GameObject>(Characters+"Accessories/ammo_crate_withLid.prefab"),
                g.transform,"KayKit_SupplyCrate",adventurer,new Bounds(g.transform.position,Vector3.one));
            var block=g.AddComponent<BreakableBlock>();block.grantsAxes=reward;
            // Small axe emblem advertises what an unopened reward box contains.
            if(reward) {
                var emblem=UnityEngine.Object.Instantiate(CreateAxePrefab(),g.transform);emblem.name="AxeEmblem";
                emblem.transform.localPosition=new Vector3(0,0,-.62f);emblem.transform.localScale=Vector3.one*.55f;
            }
        }
        static GameObject CreateAxePrefab()
        {
            var path=KayKitPilotBuilder.LocalRoot+"/AxeProjectileVisual.prefab";
            var existing=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(existing!=null)return existing;
            var pivot=new GameObject("AxeProjectileVisual");
            ProductLevelBuilder.Visual(AssetDatabase.LoadAssetAtPath<GameObject>(Characters+"Accessories/axe_1handed.prefab"),
                pivot.transform,"KayKit_Axe",adventurer,new Bounds(Vector3.zero,new Vector3(.5f,.85f,.14f)));
            var saved=PrefabUtility.SaveAsPrefabAsset(pivot,path);UnityEngine.Object.DestroyImmediate(pivot);return saved;
        }
        static void ConfigureThrowAnimation()
        {
            var skin=session.runner.GetComponentInChildren<VisualSkin>();
            var source=AssetDatabase.GetAssetPath(skin.animationController);
            var path=KayKitPilotBuilder.LocalRoot+"/EngineerLevelV8.controller";
            if(!File.Exists(path)) AssetDatabase.CopyAsset(source,path);
            var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
            var sm=controller.layers[0].stateMachine;
            if(!sm.states.Any(s=>s.state.name=="Throw"))
            {
                var state=sm.AddState("Throw");
                state.motion=AssetDatabase.LoadAssetAtPath<AnimationClip>("Assets/KayKit/Characters/Animations/Animations/Rig_Medium/General/Throw.anim");
                if(state.motion==null)throw new FileNotFoundException("Falta Throw.anim");
            }
            skin.animationController=controller;EditorUtility.SetDirty(controller);
        }
        static void AddMovingShape(GameObject visual,Vector3 travel,float period)
        {
            var b=BoundsOf(visual);var pivot=new GameObject(visual.name+"_Motion");pivot.transform.SetParent(root,false);pivot.transform.position=b.center;
            visual.transform.SetParent(pivot.transform,true);var shape=pivot.AddComponent<BoxCollider>();shape.size=b.size*.85f;shape.isTrigger=true;
            var motion=pivot.AddComponent<MovingHazard>();motion.session=session;motion.travel=travel;motion.period=period;
        }
        static GameObject Solid(string id,string name,Vector3 center,Vector3 size)
        {
            var g=Art(id,name,center,size);var b=BoundsOf(g);var shape=g.AddComponent<BoxCollider>();
            shape.center=g.transform.InverseTransformPoint(b.center);
            shape.size=new Vector3(b.size.x/g.transform.lossyScale.x,b.size.y/g.transform.lossyScale.y,b.size.z/g.transform.lossyScale.z);return g;
        }
        static GameObject Art(string id,string name,Vector3 center,Vector3 size,Quaternion? rotation=null)
        {
            var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(Pack+id+".prefab");
            if(prefab==null)throw new FileNotFoundException(Pack+id+".prefab");
            var wrapper=new GameObject(name);wrapper.transform.SetParent(root,false);
            var model=UnityEngine.Object.Instantiate(prefab,wrapper.transform);
            model.transform.localRotation=rotation??Quaternion.identity;
            Paint(model,kit);DisableColliders(model);
            var b=BoundsOf(wrapper);
            wrapper.transform.localScale=new Vector3(size.x/b.size.x,size.y/b.size.y,size.z/b.size.z);
            wrapper.transform.position+=center-BoundsOf(wrapper).center;
            return wrapper;
        }
        static void Paint(GameObject g,Material m) {foreach(var r in g.GetComponentsInChildren<Renderer>(true))r.sharedMaterials=r.sharedMaterials.Select(_=>m).ToArray();}
        static void DisableColliders(GameObject g){foreach(var c in g.GetComponentsInChildren<Collider>(true))c.enabled=false;}
        static void MeshCollision(GameObject g)
        {
            DisableColliders(g);
            foreach(var f in g.GetComponentsInChildren<MeshFilter>())
            {var c=f.gameObject.AddComponent<MeshCollider>();c.sharedMesh=f.sharedMesh;}
        }
        static Bounds BoundsOf(GameObject g)
        {var r=g.GetComponentsInChildren<Renderer>(true);var b=r[0].bounds;foreach(var x in r.Skip(1))b.Encapsulate(x.bounds);return b;}
        static void FitSky()
        {
            for(var i=0;i<7;i++) {
                var panel=GameObject.Find("OriginalSky_"+i);
                panel.transform.localScale=new Vector3(i%2==0?56.1f:-56.1f,30f,1f);
                var p=panel.transform.position;p.y=-4f;panel.transform.position=p;
            }
        }
        static void AddArchFootings()
        {
            foreach(var t in UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))
                if(t.name.StartsWith("KayKit_") && t.name.Contains("Arch")) {
                    var name="ArchFooting_"+t.name;if(GameObject.Find(name)!=null)continue;
                    var b=BoundsOf(t.gameObject);
                    Art("blue/platform_4x4x2_blue",name,new Vector3(b.center.x,b.min.y-.21f,b.center.z),new Vector3(b.size.x+.4f,.4f,b.size.z+.6f));
                }
        }
    }
}
