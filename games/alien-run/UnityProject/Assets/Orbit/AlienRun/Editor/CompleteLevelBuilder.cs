using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
namespace Orbit.AlienRun.Editor
{
    // Explicit reconstruction of V8 after the owner requested a complete playable course.
    public static class CompleteLevelBuilder
    {
        static Transform terrain,traversal,hazards,enemies,scenery,collectibles;
        static RunSession session;
        static readonly List<Collectible> items=new List<Collectible>();
        static int coinId,starId;
        static GameObject Piece(string source,string name,Transform parent,Vector3 position,Vector3 size)
        {
            var g=(GameObject)PrefabUtility.InstantiatePrefab(GameplayKitBuilder.Load(source));g.name=name;
            g.transform.SetParent(parent,false);g.transform.position=position;
            var native=g.GetComponent<GameElement>().nativeSize;
            g.transform.localScale=new Vector3(size.x/Mathf.Max(native.x,.001f),size.y/Mathf.Max(native.y,.001f),size.z/Mathf.Max(native.z,.001f));
            foreach(var danger in g.GetComponentsInChildren<ContactDanger>())danger.session=session;
            var pad=g.GetComponent<BouncePad>();if(pad!=null){pad.session=session;pad.halfWidth=size.x*.5f;}
            return g;
        }
        static void NoCollision(GameObject g){foreach(var c in g.GetComponentsInChildren<Collider>())c.enabled=false;foreach(var d in g.GetComponentsInChildren<ContactDanger>())d.enabled=false;}
        static Transform Group(Transform parent,string name){var t=new GameObject(name).transform;t.SetParent(parent,false);return t;}
        static void Ground(string color,float left,float right,float top=0)
        {
            var count=Mathf.CeilToInt((right-left)/4);var width=(right-left)/count;
            for(var i=0;i<count;i++)Piece("platform_4x4x2_"+color,$"Floor_{color}_{left:0}_{i:00}",terrain,new Vector3(left+(i+.5f)*width,top,0),new Vector3(width,3,4));
        }
        static void Ramp(string color,float left,float right,float rise)
        {var e=GameplayKitBuilder.Load("platform_slope_4x6x4_"+color).GetComponent<GameElement>();Piece("platform_slope_4x6x4_"+color,$"Ramp_{color}_{left:0}",terrain,new Vector3((left+right)*.5f,0,0),new Vector3(right-left,rise*e.nativeSize.y/e.slopeRise,4));}
        static GameObject Platform(string color,string name,float left,float right,float top)
        {
            var g=Piece("floor_wood_2x6",name,traversal,new Vector3((left+right)*.5f,top,0),new Vector3(right-left,.35f,2.6f));
            foreach(var x in new[]{left+.5f,right-.5f}){
                var pillar=Piece("pillar_1x1x4",name+"_Support",scenery,new Vector3(x,top-.35f,2.2f),new Vector3(.5f,top+1.5f,.5f));NoCollision(pillar);
            }
            return g;
        }
        static void Coins(float left,float right,float y,float spacing=2)
        {for(var x=left;x<=right+.01f;x+=spacing)Coin(x,y);}
        static void Coin(float x,float y)
        {
            var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(GameplayKitBuilder.Library+"/AR_Coin.prefab");
            var g=(GameObject)PrefabUtility.InstantiatePrefab(prefab);g.transform.SetParent(collectibles,false);g.transform.position=new Vector3(x,y,0);
            var c=g.GetComponent<Collectible>();c.collectibleId=$"c{++coinId:00}";g.name="Coin_"+c.collectibleId;items.Add(c);
        }
        static void Arc(float launchX,float ground,float dx)
        {
            var v=Mathf.Sqrt(2*28*2.8f);
            foreach(var fraction in new[]{.28f,.5f,.72f}){var t=dx*fraction/7;Coin(launchX+dx*fraction,ground+.98f+v*t-14*t*t);}
        }
        static void SpringArc()
        {
            foreach(var fraction in new[]{.28f,.5f,.72f}){var x=228.7f+6*fraction;var t=(x-228)/7;Coin(x,4.23f+13*t-14*t*t);}
        }
        static void Star(string color,float x,float y)
        {
            var g=Piece("star_"+color,"Star",collectibles,new Vector3(x,y,0),new Vector3(1.1f,1.1f,.4f));
            var c=g.GetComponent<Collectible>();c.isStar=true;c.collectibleId=$"s{++starId:00}";g.name="Star_"+c.collectibleId;items.Add(c);
        }
        static void Supply(float x)
        {
            var g=Piece("platform_wood_1x1x1","Supply_Axes_"+x,traversal,new Vector3(x,3.05f,0),new Vector3(1.1f,1,1.2f));
            g.GetComponent<BreakableBlock>().grantsAxes=true;
            var emblem=UnityEngine.Object.Instantiate(session.runner.GetComponent<AxeWeapon>().axePrefab,g.transform);emblem.name="AxeEmblem";
            emblem.transform.localPosition=new Vector3(0,0,-.62f);emblem.transform.localScale=Vector3.one*.55f;
        }
        static GameObject Spring(string color,float x,float top)
        {var g=Piece("spring_pad_"+color,"Spring_"+x,traversal,new Vector3(x,top,0),new Vector3(1.5f,.45f,1.6f));g.GetComponent<BouncePad>().upwardSpeed=13;return g;}
        static void Actor(string model,float x,bool throws)
        {
            var path=GameplayKitBuilder.Library+"/AR_Enemy_"+model+".prefab";
            var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if(prefab==null)
            {
                var root=new GameObject("AR_Enemy_"+model);var visual=UnityEngine.Object.Instantiate(GameplayKitBuilder.Load(model),root.transform);visual.name="Skin";
                visual.transform.localPosition=Vector3.zero;var b=GameplayKitBuilder.BoundsOf(visual);visual.transform.localScale=Vector3.one*(1.8f/b.size.y);
                var animator=visual.GetComponentInChildren<Animator>();animator.runtimeAnimatorController=GameplayKitBuilder.EnemyController();animator.applyRootMotion=false;
                var c=root.AddComponent<CapsuleCollider>();c.height=1.8f;c.radius=.45f;c.isTrigger=true;
                root.AddComponent<PatrolEnemy>();if(throws){var t=root.AddComponent<EnemyAxeThrower>();t.axePrefab=session.runner.GetComponent<AxeWeapon>().axePrefab;}
                prefab=PrefabUtility.SaveAsPrefabAsset(root,path);UnityEngine.Object.DestroyImmediate(root);
            }
            var g=(GameObject)PrefabUtility.InstantiatePrefab(prefab);g.transform.SetParent(enemies,false);g.transform.position=new Vector3(x,.9f,0);g.name=(throws?"Barbarian_":"Walker_")+x;
            var p=g.GetComponent<PatrolEnemy>();p.session=session;p.leftX=x-1;p.rightX=x+1;p.speed=throws?.55f:1.4f;p.hitRadius=.78f;
            var t2=g.GetComponent<EnemyAxeThrower>();if(t2!=null)t2.session=session;
        }
        static CheckpointFlag Flag(float x)
        {
            var g=Piece("flag_C_blue","Checkpoint_"+x,scenery,new Vector3(x,1.7f,1.2f),new Vector3(1.5f,3.4f,.25f));
            var f=g.GetComponentInChildren<MeshFilter>();f.sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(KayKitPilotBuilder.LocalRoot+"/CheckpointCloth.asset");
            var flag=g.AddComponent<CheckpointFlag>();flag.session=session;flag.respawnPoint=new Vector3(x,.98f,0);return flag;
        }
        static void Decor(string color,float start,float end)
        {
            for(var x=start+5;x<end;x+=12)
            {
                var pillar=Piece("pillar_2x2x4",$"BackdropTower_{x}",scenery,new Vector3(x,1.4f,5),new Vector3(1.6f,4.4f,1.6f));NoCollision(pillar);
                var rail=Piece("railing_straight_double_"+color,$"BackdropRail_{x}",scenery,new Vector3(x+3,1,3.3f),new Vector3(4,1.2f,.22f));NoCollision(rail);
                var pipe=Piece("pipe_90_A_"+color,$"BackdropPipe_{x}",scenery,new Vector3(x+6,.7f,4.5f),new Vector3(1.6f,1.6f,1.6f));NoCollision(pipe);
            }
            var arch=Piece("arch_wide_"+color,"SectorGate_"+color,scenery,new Vector3(start+1,2.1f,3.2f),new Vector3(5,4.2f,1));NoCollision(arch);
            var sign=Piece("signage_arrows_right_"+color,"Direction_"+color,scenery,new Vector3(start+4,2.8f,2.8f),new Vector3(1.2f,.8f,.15f));NoCollision(sign);
        }
        static void CreateCoinPrefab()
        {
            var root=new GameObject("AR_Coin");root.AddComponent<Collectible>();var coin=GameObject.CreatePrimitive(PrimitiveType.Cylinder);coin.name="CoinVisual";coin.transform.SetParent(root.transform,false);
            coin.transform.localRotation=Quaternion.Euler(90,0,0);coin.transform.localScale=new Vector3(.6f,.055f,.6f);
            UnityEngine.Object.DestroyImmediate(coin.GetComponent<Collider>());coin.GetComponent<Renderer>().sharedMaterial=ProductLevelBuilder.LoadMaterial("LevelOneGold");
            coin.GetComponent<Renderer>().shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
            PrefabUtility.SaveAsPrefabAsset(root,GameplayKitBuilder.Library+"/AR_Coin.prefab");UnityEngine.Object.DestroyImmediate(root);
        }
        public static void Create()
        {
            var scene=EditorSceneManager.OpenScene(LevelPlayBuilder.ScenePath);session=UnityEngine.Object.FindFirstObjectByType<RunSession>();
            // Retain the real player, bridge, camera, session and lighting; replace obsolete level geometry.
            var keep=new HashSet<GameObject>{session.transform.root.gameObject,session.runner.transform.root.gameObject,session.bridge.transform.root.gameObject,Camera.main.transform.root.gameObject};
            foreach(var light in UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None))keep.Add(light.transform.root.gameObject);
            foreach(var root in scene.GetRootGameObjects())if(!keep.Contains(root))UnityEngine.Object.DestroyImmediate(root);
            var course=Group(null,"V8_CompleteCourse");terrain=Group(course,"Terrain");traversal=Group(course,"Traversal");hazards=Group(course,"Hazards");enemies=Group(course,"Enemies");collectibles=Group(course,"Collectibles");scenery=Group(course,"Scenery");
            items.Clear();coinId=starId=0;CreateCoinPrefab();
            var weapon=session.runner.GetComponent<AxeWeapon>();
            var axe=UnityEngine.Object.Instantiate(GameplayKitBuilder.Load("axe_1handed"));axe.name="AR_AxeProjectileVisual";
            var b=GameplayKitBuilder.BoundsOf(axe);axe.transform.localScale=Vector3.one*(.65f/Mathf.Max(b.size.x,b.size.y));
            weapon.axePrefab=PrefabUtility.SaveAsPrefabAsset(axe,GameplayKitBuilder.Library+"/AR_Axe.prefab");UnityEngine.Object.DestroyImmediate(axe);
            var skin=session.runner.GetComponentInChildren<VisualSkin>();skin.visualPrefab=GameplayKitBuilder.Load("Engineer");skin.visualOffset=Vector3.zero;skin.visualEuler=Vector3.zero;
            skin.visualScale=Vector3.one;
            if(skin.fallbackVisual!=null){UnityEngine.Object.DestroyImmediate(skin.fallbackVisual);skin.fallbackVisual=null;}
            session.runner.transform.position=session.spawn=new Vector3(0,.98f,0);session.requiredCollectibles=24;session.collectibleLabel="MONEDAS";
            session.extraGuidedJumpX=-1;session.laterGuidedJumps=Array.Empty<float>();
            var cc=session.runner.GetComponent<CharacterController>();cc.height=1.8f;cc.radius=.36f;cc.center=Vector3.zero;cc.stepOffset=.48f;cc.slopeLimit=50;
            Ground("yellow",-12,16);Ground("yellow",16,22,-.42f);Ground("yellow",29,44);Ramp("yellow",16,22,1.2f);Ground("yellow",22,26,1.2f);
            Supply(8);Coins(4,14,1.25f);Coins(17,21,2);Arc(24.4f,1.2f,6);Coins(30,32,1.25f);Arc(33.6f,0,6);Coins(40,42,1.25f);Star("yellow",23.4f,4.4f);
            Piece("floor_spikes_2x2x1","Spikes_Tutorial",hazards,new Vector3(36,.4f,0),new Vector3(1.5f,.8f,1.8f));Decor("yellow",0,44);
            Ground("blue",44,69);Ground("blue",72,92);Spring("blue",52,.45f);Platform("blue","Bridge_Spring",54,61,2.4f);
            Coins(46,50,1.25f);Coins(55,59,3.5f);Arc(67.3f,0,6);Coins(74,78,1.25f);Coins(84,90,1.25f);Star("blue",58,5.2f);Decor("blue",44,92);
            var crusher=Piece("spikeblock_down_red","Crusher_Blue",hazards,new Vector3(80,6,0),new Vector3(1.6f,2,1.8f));crusher.GetComponent<ContactDanger>().enabled=false;
            var body=crusher.AddComponent<Rigidbody>();body.isKinematic=true;body.useGravity=false;
            var motion=crusher.AddComponent<MovingHazard>();motion.session=session;motion.travel=Vector3.down*4.7f;motion.period=4.6f;
            var warning=Piece("signage_arrow_stand_red","Crusher_Warning",scenery,new Vector3(77,1,2.2f),new Vector3(1.2f,2,.3f));NoCollision(warning);
            Ground("green",92,114);Ground("green",117,142);Supply(98);Supply(119);Actor("Barbarian",108,true);Actor("Rogue",128,false);
            Ground("green",132,135,.9f);Platform("green","Bridge_Canopy",136,140,3.1f);
            Coins(94,102,1.25f);Coins(109,111,1.25f);Arc(112.3f,0,6);Coins(120,124,1.25f);Coins(132.5f,134.5f,2);Coins(137,139,4.2f);Coins(140,142,1.25f);Star("green",137,5.6f);Decor("green",92,142);
            Ground("red",142,163);Ground("red",170,192);
            var trap=Piece("floor_spikes_trap_2x2x1_red","Trap_Red",hazards,new Vector3(152,-.35f,0),new Vector3(2,1.3f,2));
            var spike=trap.GetComponentsInChildren<Transform>().First(t=>t.name.Contains("trap_spikes"));
            var tb=GameplayKitBuilder.BoundsOf(spike.gameObject);var box=spike.gameObject.AddComponent<BoxCollider>();box.isTrigger=true;box.center=spike.InverseTransformPoint(tb.center);var scale=spike.lossyScale;box.size=new Vector3(tb.size.x/scale.x,tb.size.y/scale.y,tb.size.z/scale.z)*.86f;
            var trapScript=trap.AddComponent<SpikeTrap>();trapScript.session=session;trapScript.spikes=spike;trapScript.danger=box;
            var ferryObject=Platform("red","Ferry_Red",162.9f,166.1f,.6f);
            foreach(var support in scenery.GetComponentsInChildren<Transform>().Where(t=>t.name=="Ferry_Red_Support").ToArray())UnityEngine.Object.DestroyImmediate(support.gameObject);
            var ferryBody=ferryObject.AddComponent<Rigidbody>();ferryBody.isKinematic=true;ferryBody.useGravity=false;ferryBody.interpolation=RigidbodyInterpolation.Interpolate;
            var ferry=ferryObject.AddComponent<MovingPlatform>();ferry.session=session;ferry.travel=Vector3.right*3.3f;ferry.period=4;
            Ramp("red",174,178,1.1f);Ground("red",178,183,1.1f);
            var roller=Piece("spikeroller_horizontal","Roller_Upper",hazards,new Vector3(180,1.8f,0),new Vector3(1.1f,1.3f,1.5f));roller.GetComponent<ContactDanger>().enabled=false;
            var rb=roller.AddComponent<Rigidbody>();rb.isKinematic=true;rb.useGravity=false;var rm=roller.AddComponent<MovingHazard>();rm.session=session;rm.travel=Vector3.right*2;rm.period=3.2f;roller.AddComponent<VisualSpinner>().degreesPerSecond=180;
            Coins(144,148,1.25f);Arc(149.6f,0,6);Coins(156,160,1.25f);Coin(164.5f,1.8f);Coin(168,2.5f);Coins(171,173,1.25f);Coins(186,190,1.25f);Star("red",166,4);Decor("red",142,192);
            Ground("blue",192,218);Ground("blue",218,224,-.49f);Ground("blue",229,230);Ground("blue",233,246);Supply(198);Actor("Barbarian",208,true);
            Ramp("blue",218,224,1.4f);Ground("blue",224,226,1.4f);Ground("blue",226,229,2.8f);Spring("yellow",228,3.25f);
            Coins(194,202,1.25f);Coins(210,216,1.25f);Coins(219,223,2.3f);Coins(225,227,4);SpringArc();Coins(234,238,1.25f);Star("yellow",234,5.9f);Decor("blue",192,242);
            session.checkpointFlags=new[]{Flag(43),Flag(91),Flag(141),Flag(191)};session.checkpoint=session.checkpointFlags[0].respawnPoint;session.laterCheckpoints=session.checkpointFlags.Skip(1).Select(f=>f.respawnPoint).ToArray();
            var goal=Piece("flag_B_blue","Goal_Flag",scenery,new Vector3(240,2.2f,1),new Vector3(2,4.4f,.4f));NoCollision(goal);
            var finish=Group(course,"Goal_Trigger");finish.position=new Vector3(240,1,0);session.finish=finish;session.collectibles=items.ToArray();
            for(var i=0;i<5;i++){
                var sky=GameObject.CreatePrimitive(PrimitiveType.Quad);sky.name="Sky_Texture_"+i;sky.transform.SetParent(scenery,false);sky.transform.position=new Vector3(16+i*56,2,24);sky.transform.localScale=new Vector3(56.1f,28,1);
                UnityEngine.Object.DestroyImmediate(sky.GetComponent<Collider>());sky.GetComponent<Renderer>().sharedMaterial=AssetDatabase.LoadAssetAtPath<Material>(KayKitPilotBuilder.LocalRoot+"/AlienRunSkyV1.mat");sky.GetComponent<Renderer>().shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            var navigator=session.GetComponent<PracticeNavigator>()??session.gameObject.AddComponent<PracticeNavigator>();navigator.session=session;navigator.crusher=motion;navigator.ferry=ferry;
            navigator.jumps=new[]{6.8f,24.4f,33.6f,67.3f,112.3f,116.8f,129.6f,134.3f,149.6f,177.1f,223.5f,228.7f};
            var c=Camera.main;var follow=c.GetComponent<FollowCamera>();c.orthographicSize=4.8f;follow.baseFocusY=3.25f;follow.offset=new Vector3(0,3,-18);follow.verticalFollow=.65f;follow.maxVerticalLift=5;follow.stableFraming=true;follow.minFocusX=2;follow.maxFocusX=240;follow.SnapTo(session.spawn);
            Physics.SyncTransforms();EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
            File.WriteAllText("C:/play-games/evidence/complete-level-content.json",JsonUtility.ToJson(new Content{ids=items.Select(x=>x.collectibleId).ToArray(),stars=items.Where(x=>x.isStar).Select(x=>x.collectibleId).ToArray(),coins=coinId,required=24,length=240},true));
            Debug.Log($"Complete V8: {coinId} coins, {starId} stars; 240m course");
        }
        [Serializable]class Content{public string[] ids,stars;public int coins,required,length;}
        public static void Capture()
        {
            EditorSceneManager.OpenScene(LevelPlayBuilder.ScenePath);var c=Camera.main;
            foreach(var x in new[]{2,20,52,80,108,137,166,180,222,238})
            {
                c.GetComponent<FollowCamera>().SnapTo(new Vector3(x,1,0));var rt=new RenderTexture(1280,720,24);c.targetTexture=rt;c.Render();RenderTexture.active=rt;
                var image=new Texture2D(1280,720,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();
                File.WriteAllBytes("C:/play-games/evidence/complete-level-"+x+".png",image.EncodeToPNG());c.targetTexture=null;RenderTexture.active=null;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(image);
            }
        }
        public static void CreateAndCapture(){Create();Capture();}
    }
}
