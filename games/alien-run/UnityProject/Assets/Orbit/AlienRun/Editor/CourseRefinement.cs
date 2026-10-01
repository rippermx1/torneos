using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
namespace Orbit.AlienRun.Editor
{
    public static class CourseRefinement
    {
        public static void FinalizeAndCapture()
        {
            var scene=EditorSceneManager.OpenScene(LevelPlayBuilder.ScenePath);var session=Object.FindFirstObjectByType<RunSession>();
            foreach(var t in Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))if(t.name.StartsWith("Direction_")){
                var e=t.GetComponent<GameElement>();t.localScale=new Vector3(3/e.nativeSize.x,.85f/e.nativeSize.y,.38f/e.nativeSize.z);
            }
            var warning=GameObject.Find("Crusher_Warning").transform.Find("Visual");warning.Rotate(0,180,0);
            var roller=GameObject.Find("Roller_Upper");var spin=roller.GetComponent<VisualSpinner>();Object.DestroyImmediate(spin);roller.transform.Find("Visual").gameObject.AddComponent<VisualSpinner>().degreesPerSecond=180;
            var runner=session.runner;runner.name="Player_Runner";var linkedSession=runner.session;runner.session=null;
            PrefabUtility.SaveAsPrefabAsset(runner.gameObject,GameplayKitBuilder.Library+"/AR_Player.prefab");runner.session=linkedSession;
            EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);
            var catalogPath="C:/play-games/evidence/kaykit-prefab-catalog.json";var catalog=JsonUtility.FromJson<GameplayKitBuilder.Catalog>(File.ReadAllText(catalogPath));
            foreach(var row in catalog.prefabs){var root=PrefabUtility.LoadPrefabContents(row.copy);var e=root.GetComponent<GameElement>();if(root.GetComponentInChildren<Animator>()!=null){e.role="CharacterVisual";PrefabUtility.SaveAsPrefabAsset(root,row.copy);}row.role=e.role;PrefabUtility.UnloadPrefabContents(root);}
            File.WriteAllText(catalogPath,JsonUtility.ToJson(catalog,true));AssetDatabase.SaveAssets();CompleteLevelBuilder.Capture();
        }
        public static void FinishLaunchTrail()
        {
            var scene=EditorSceneManager.OpenScene(LevelPlayBuilder.ScenePath);var session=Object.FindFirstObjectByType<RunSession>();
            foreach(var c in session.collectibles)if(!c.isStar && c.transform.position.x>229 && c.transform.position.x<233.5f && c.transform.position.y>2){
                var p=c.transform.position;var t=(p.x-228)/7;p.y=4.23f+13*t-14*t*t;c.transform.position=p;
            }
            foreach(var t in Object.FindObjectsByType<Transform>(FindObjectsSortMode.None))if(t.name.StartsWith("Sky_Texture_")){
                var p=t.position;p.y=2;t.position=p;var s=t.localScale;s.y=28;t.localScale=s;
            }
            EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);CompleteLevelBuilder.Capture();
        }
        public static void Rebuild()
        {
            foreach(var name in new[]{"Engineer","Barbarian","Barbarian_Large","Druid","Knight","Mage","Ranger","Rogue","Rogue_Hooded"}){
                var path=AssetDatabase.GetAssetPath(GameplayKitBuilder.Load(name));var root=PrefabUtility.LoadPrefabContents(path);var animator=root.GetComponentInChildren<Animator>();
                var rig=name.Contains("Large")?"Rig_Large":"Rig_Medium";
                var clip=AssetDatabase.LoadAssetAtPath<AnimationClip>("Assets/KayKit/Characters/Animations/Animations/"+rig+"/General/Idle_A.anim");
                clip.SampleAnimation(animator.gameObject,0);var b=GameplayKitBuilder.GeometryBounds(root);var visual=root.transform.Find("Visual");
                var factor=1.8f/b.size.y;visual.localScale*=factor;visual.localPosition*=factor;b=GameplayKitBuilder.GeometryBounds(root);
                visual.localPosition-=b.center;root.GetComponent<GameElement>().nativeSize=GameplayKitBuilder.GeometryBounds(root).size;
                PrefabUtility.SaveAsPrefabAsset(root,path);PrefabUtility.UnloadPrefabContents(root);
            }
            foreach(var name in new[]{"Barbarian","Rogue"}){
                var path=GameplayKitBuilder.Library+"/AR_Enemy_"+name+".prefab";if(!File.Exists(path))continue;
                var root=PrefabUtility.LoadPrefabContents(path);UnityEngine.Object.DestroyImmediate(root.transform.Find("Skin").gameObject);
                var skin=(GameObject)PrefabUtility.InstantiatePrefab(GameplayKitBuilder.Load(name),root.transform);skin.name="Skin";skin.transform.localPosition=Vector3.zero;
                var animator=skin.GetComponentInChildren<Animator>();animator.runtimeAnimatorController=GameplayKitBuilder.EnemyController();animator.applyRootMotion=false;
                PrefabUtility.SaveAsPrefabAsset(root,path);PrefabUtility.UnloadPrefabContents(root);
            }
            // Turn narrow flags/sign boards into the XY plane, retaining source GUIDs and copy GUIDs.
            foreach(var guid in AssetDatabase.FindAssets("t:Prefab",new[]{GameplayKitBuilder.Library})){
                var path=AssetDatabase.GUIDToAssetPath(guid);var asset=AssetDatabase.LoadAssetAtPath<GameObject>(path);var e=asset.GetComponent<GameElement>();
                if(e==null || !(e.role=="Flag"||e.family.StartsWith("signage")) || e.nativeSize.z<=e.nativeSize.x+.1f)continue;
                var root=PrefabUtility.LoadPrefabContents(path);var data=root.GetComponent<GameElement>();
                var v=root.transform.Find("Visual");v.localRotation=Quaternion.Euler(0,90,0)*v.localRotation;
                v.localPosition=Quaternion.Euler(0,90,0)*v.localPosition;data.nativeSize=GameplayKitBuilder.BoundsOf(root).size;data.facingYaw+=90;
                PrefabUtility.SaveAsPrefabAsset(root,path);PrefabUtility.UnloadPrefabContents(root);
            }
            foreach(var guid in AssetDatabase.FindAssets("t:Prefab",new[]{GameplayKitBuilder.Library})){
                var path=AssetDatabase.GUIDToAssetPath(guid);var asset=AssetDatabase.LoadAssetAtPath<GameObject>(path);var e=asset.GetComponent<GameElement>();if(e==null||e.role!="Slope")continue;
                var root=PrefabUtility.LoadPrefabContents(path);var data=root.GetComponent<GameElement>();var b=GameplayKitBuilder.BoundsOf(root);
                Physics.SyncTransforms();
                float Top(float x){var max=float.NegativeInfinity;var ray=new Ray(new Vector3(x,b.max.y+1,b.center.z),Vector3.down);
                    foreach(var c in root.GetComponentsInChildren<MeshCollider>())if(c.Raycast(ray,out var hit,b.size.y+3))max=Mathf.Max(max,hit.point.y);return max;}
                var epsilon=b.size.x*.01f;var low=Top(b.min.x+epsilon);var high=Top(b.max.x-epsilon);
                if(float.IsInfinity(low)||float.IsInfinity(high))throw new System.InvalidOperationException("Cannot measure slope "+path);
                var rise=(high-low)/.98f;low-=rise*.01f;
                root.transform.Find("Visual").localPosition+=Vector3.down*low;data.slopeRise=rise;data.nativeSize=GameplayKitBuilder.BoundsOf(root).size;
                PrefabUtility.SaveAsPrefabAsset(root,path);PrefabUtility.UnloadPrefabContents(root);
            }
            var catalogPath="C:/play-games/evidence/kaykit-prefab-catalog.json";
            var catalog=JsonUtility.FromJson<GameplayKitBuilder.Catalog>(File.ReadAllText(catalogPath));
            foreach(var row in catalog.prefabs){var e=AssetDatabase.LoadAssetAtPath<GameObject>(row.copy).GetComponent<GameElement>();row.size=e.nativeSize;row.yaw=e.facingYaw;row.rise=e.slopeRise;}
            File.WriteAllText(catalogPath,JsonUtility.ToJson(catalog,true));
            CompleteLevelBuilder.CreateAndCapture();
        }
    }
}
