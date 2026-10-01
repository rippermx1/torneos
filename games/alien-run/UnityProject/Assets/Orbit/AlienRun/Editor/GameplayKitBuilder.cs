using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
namespace Orbit.AlienRun.Editor
{
    public static class GameplayKitBuilder
    {
        public const string Library=KayKitPilotBuilder.LocalRoot+"/GameplayKit";
        public static readonly Dictionary<string,string> Paths=new Dictionary<string,string>();
        [Serializable] public class Entry { public string source,sourceGuid,copy,copyGuid,family,role,physics;public Vector3 size;public float yaw,rise; }
        [Serializable] public class Catalog {public Entry[] prefabs;public int count;}
        public static Bounds BoundsOf(GameObject g)
        {
            var rs=g.GetComponentsInChildren<Renderer>(true);if(rs.Length==0)return new Bounds(Vector3.zero,Vector3.one);
            var b=rs[0].bounds;foreach(var r in rs.Skip(1))b.Encapsulate(r.bounds);return b;
        }
        public static Bounds GeometryBounds(GameObject g)
        {
            var result=new Bounds();var first=true;
            void Add(Vector3 p){if(first){result=new Bounds(p,Vector3.zero);first=false;}else result.Encapsulate(p);}
            foreach(var r in g.GetComponentsInChildren<SkinnedMeshRenderer>()){
                var mesh=new Mesh();r.BakeMesh(mesh);foreach(var v in mesh.vertices)Add(r.transform.TransformPoint(v));UnityEngine.Object.DestroyImmediate(mesh);
            }
            foreach(var f in g.GetComponentsInChildren<MeshFilter>())if(f.sharedMesh!=null){
                var b=f.sharedMesh.bounds;foreach(var x in new[]{b.min.x,b.max.x})foreach(var y in new[]{b.min.y,b.max.y})foreach(var z in new[]{b.min.z,b.max.z})Add(f.transform.TransformPoint(new Vector3(x,y,z)));
            }
            return result;
        }
        static string Family(string name)=>System.Text.RegularExpressions.Regex.Replace(name,"_(blue|green|red|yellow)$","");
        static string Role(string family,string path)
        {
            if(!path.Contains("Platformer"))return path.Contains("/Prefabs/Characters/")||path.Contains("Mannequin")?"CharacterVisual":"AccessoryVisual";
            if(family.StartsWith("platform_slope"))return "Slope";
            if(family.Contains("spikes_trap"))return "TimedTrap";
            if(family.Contains("spike")||family.Contains("saw")||family.Contains("hammer")||family.StartsWith("swiper"))return "Danger";
            if(family=="spring_pad" || family=="spring")return "Spring";
            if(family=="star" || family=="diamond" || family=="heart" || family=="power")return "Pickup";
            if(family=="chest" || family=="chest_large" || family=="platform_wood_1x1x1")return "Breakable";
            if(family.StartsWith("flag"))return "Flag";
            if(family.StartsWith("platform_")||family.StartsWith("floor_wood")||family.StartsWith("floor_net")||family.StartsWith("safetynet")||family.StartsWith("pillar")||family.StartsWith("barrier")||family.StartsWith("conveyor"))return "Surface";
            return "Scenery";
        }
        public static void CreateLibrary()
        {
            Directory.CreateDirectory(Library);AssetDatabase.Refresh();
            var kit=ProductLevelBuilder.LoadMaterial("PlatformerURP");var character=ProductLevelBuilder.LoadMaterial("EngineerURP");
            var entries=new List<Entry>();
            foreach(var guid in AssetDatabase.FindAssets("t:Prefab",new[]{"Assets/KayKit"}).OrderBy(g=>AssetDatabase.GUIDToAssetPath(g),StringComparer.Ordinal))
            {
                var source=AssetDatabase.GUIDToAssetPath(guid);var original=AssetDatabase.LoadAssetAtPath<GameObject>(source);
                var family=Family(original.name);var role=Role(family,source);
                var relative=source.Substring("Assets/KayKit/".Length);
                var copy=Library+"/"+relative;Directory.CreateDirectory(Path.GetDirectoryName(copy));
                var root=new GameObject("AR_"+original.name);
                var visual=(GameObject)PrefabUtility.InstantiatePrefab(original);visual.transform.SetParent(root.transform,false);visual.name="Visual";
                PrefabUtility.UnpackPrefabInstance(visual,PrefabUnpackMode.Completely,InteractionMode.AutomatedAction);
                foreach(var c in visual.GetComponentsInChildren<Collider>(true))UnityEngine.Object.DestroyImmediate(c);
                foreach(var body in visual.GetComponentsInChildren<Rigidbody>(true))UnityEngine.Object.DestroyImmediate(body);
                var material=source.Contains("Platformer")?kit:character;
                foreach(var r in visual.GetComponentsInChildren<Renderer>(true))r.sharedMaterials=r.sharedMaterials.Select(_=>material).ToArray();
                var yaw=0f;var measured=BoundsOf(root);
                if((role=="Surface"||role=="Slope"||role=="Flag"||family.StartsWith("signage")) && measured.size.z>measured.size.x+.1f){yaw=90;visual.transform.localRotation=Quaternion.Euler(0,yaw,0);}
                measured=BoundsOf(root);
                if(role=="Slope")
                {
                    foreach(var f in visual.GetComponentsInChildren<MeshFilter>()){var mc=f.gameObject.AddComponent<MeshCollider>();mc.sharedMesh=f.sharedMesh;}
                    Physics.SyncTransforms();
                    float Top(float x){return Physics.Raycast(new Vector3(x,measured.max.y+1,measured.center.z),Vector3.down,out var h,measured.size.y+2)?h.point.y:measured.min.y;}
                    if(Top(measured.max.x-.1f)<Top(measured.min.x+.1f)){yaw+=180;visual.transform.localRotation=Quaternion.Euler(0,yaw,0);}
                    measured=BoundsOf(root);
                }
                // Terrain origins are on the walkable top; slopes start at their low edge height.
                var pivot=(role=="Surface"||role=="Spring")?new Vector3(measured.center.x,measured.max.y,measured.center.z):
                    role=="Slope"?new Vector3(measured.center.x,measured.min.y+measured.size.y*.5f,measured.center.z):measured.center;
                visual.transform.localPosition-=pivot;
                measured=BoundsOf(root);
                var physics="visual only; no collider";
                if(role=="Surface"||role=="Spring"||role=="Breakable")
                {var box=root.AddComponent<BoxCollider>();box.center=measured.center;box.size=measured.size;physics="static BoxCollider";}
                if(role=="Slope")physics="static MeshCollider; ascending +X; low-top pivot";
                if(role=="Danger")
                {var box=root.AddComponent<BoxCollider>();box.center=measured.center;box.size=measured.size*.84f;box.isTrigger=true;root.AddComponent<ContactDanger>();physics="trigger danger; kinematic Rigidbody when moving";}
                if(role=="Breakable")root.AddComponent<BreakableBlock>();
                if(role=="Spring"){var pad=root.AddComponent<BouncePad>();pad.visual=visual.transform;pad.halfWidth=measured.size.x*.5f;physics+="; BouncePad";}
                if(role=="Pickup"){var c=root.AddComponent<Collectible>();c.isStar=family=="star";physics="rotation + proximity pickup; no rigidbody";}
                if(role=="TimedTrap")physics="static base + animated spike trigger (configured in actor)";
                var metadata=root.AddComponent<GameElement>();metadata.sourceGuid=guid;metadata.family=family;metadata.role=role;metadata.physicsPolicy=physics;
                metadata.nativeSize=measured.size;metadata.facingYaw=yaw;metadata.slopeRise=role=="Slope"?measured.size.y*.5f:0;
                PrefabUtility.SaveAsPrefabAsset(root,copy);UnityEngine.Object.DestroyImmediate(root);
                var entry=new Entry{source=source,sourceGuid=guid,copy=copy,copyGuid=AssetDatabase.AssetPathToGUID(copy),family=family,role=role,physics=physics,size=measured.size,yaw=yaw,rise=metadata==null?0:metadata.slopeRise};
                entry.rise=role=="Slope"?measured.size.y*.5f:0;entries.Add(entry);Paths[original.name]=copy;
            }
            AssetDatabase.SaveAssets();
            File.WriteAllText(WorkspacePaths.Evidence("kaykit-prefab-catalog.json"),JsonUtility.ToJson(new Catalog{prefabs=entries.ToArray(),count=entries.Count},true));
            var csv="source,source_guid,copy,copy_guid,family,role,width,height,depth,yaw,rise,physics\n";
            string Q(string s)=>"\""+s.Replace("\"","\"\"")+"\"";
            foreach(var e in entries)csv+=string.Join(",",new[]{Q(e.source),e.sourceGuid,Q(e.copy),e.copyGuid,e.family,e.role,e.size.x.ToString(System.Globalization.CultureInfo.InvariantCulture),e.size.y.ToString(System.Globalization.CultureInfo.InvariantCulture),e.size.z.ToString(System.Globalization.CultureInfo.InvariantCulture),e.yaw.ToString(),e.rise.ToString(System.Globalization.CultureInfo.InvariantCulture),Q(e.physics)})+"\n";
            File.WriteAllText(WorkspacePaths.Documentation("KAYKIT-PREFABS.csv"),csv);
            Debug.Log("Gameplay kit catalogued: "+entries.Count+" own prefabs");
        }
        public static GameObject Load(string name)
        {
            if(Paths.Count==0)foreach(var guid in AssetDatabase.FindAssets("t:Prefab",new[]{Library}))
            {var p=AssetDatabase.GUIDToAssetPath(guid);Paths[Path.GetFileNameWithoutExtension(p)]=p;}
            if(!Paths.TryGetValue(name,out var path))throw new InvalidOperationException("Missing own prefab "+name);
            return AssetDatabase.LoadAssetAtPath<GameObject>(path);
        }
        public static RuntimeAnimatorController EnemyController()
        {
            var path=Library+"/EnemyMedium.controller";
            var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
            if(controller!=null)return controller;
            AssetDatabase.CopyAsset(KayKitPilotBuilder.LocalRoot+"/EngineerV8Interactions.controller",path);
            controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(path);var sm=controller.layers[0].stateMachine;
            foreach(var pair in new[]{new[]{"Death","Death_A"},new[]{"DeathPose","Death_A_Pose"}})
            {var s=sm.AddState(pair[0]);s.motion=AssetDatabase.LoadAssetAtPath<AnimationClip>("Assets/KayKit/Characters/Animations/Animations/Rig_Medium/General/"+pair[1]+".anim");}
            EditorUtility.SetDirty(controller);AssetDatabase.SaveAssets();return controller;
        }
    }
}
