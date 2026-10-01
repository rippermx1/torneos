using System;
using System.Collections.Generic;
using System.IO;
using Orbit.SDK;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
namespace Orbit.AlienRun.Editor
{
    public static class GreyboxBuilder
    {
        public const string Root = "Assets/Orbit/AlienRun/Generated";
        public const string ScenePath = Root + "/AlienRunGreybox.unity";
        [MenuItem("Orbit/Alien Run/Create Greybox Scene")]
        public static void CreateScene()
        {
            if (File.Exists(ScenePath))
                throw new InvalidOperationException("La escena ya existe. Ábrela; no se sobrescribe tu trabajo.");
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            Directory.CreateDirectory(Root);
            AssetDatabase.Refresh();
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var floor = Material("Floor", new Color(.32f, .43f, .36f));
            var playerMaterial = Material("Player", new Color(.82f, .92f, .72f));
            var coinMaterial = Material("Crystal", new Color(.96f, .72f, .3f));
            var dangerMaterial = Material("Hazard", new Color(.76f, .25f, .2f));
            var tuning = ScriptableObject.CreateInstance<RunnerTuning>();
            AssetDatabase.CreateAsset(tuning, Root + "/RunnerTuning.asset");
            var bridge = new GameObject("OrbitBridge").AddComponent<OrbitBridge>();
            var session = new GameObject("RunSession").AddComponent<RunSession>();
            var player = new GameObject("Runner");
            player.transform.position = new Vector3(0, 2f, 0);
            var controller = player.AddComponent<CharacterController>();
            controller.height = 1.8f; controller.radius = .36f; controller.center = Vector3.zero;
            controller.stepOffset = .2f;
            var motor = player.AddComponent<RunnerMotor>();
            motor.tuning = tuning; motor.session = session;
            var skinRoot = new GameObject("VisualRoot"); skinRoot.transform.SetParent(player.transform, false);
            var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule); capsule.name = "Fallback";
            capsule.transform.SetParent(skinRoot.transform, false); capsule.transform.localScale = new Vector3(.7f,.85f,.7f);
            UnityEngine.Object.DestroyImmediate(capsule.GetComponent<Collider>());
            capsule.GetComponent<Renderer>().sharedMaterial = playerMaterial;
            var skin = skinRoot.AddComponent<VisualSkin>(); skin.fallbackVisual = capsule;
            motor.visualRoot = skinRoot.transform;
            // Shared ground route, two gaps and an elevated optional route.
            Box("Ground_A", new Vector3(8,-.5f,0), new Vector3(26,1,4), floor);
            Box("Ground_B", new Vector3(38,-.5f,0), new Vector3(26,1,4), floor);
            Box("Ground_C", new Vector3(72,-.5f,0), new Vector3(32,1,4), floor);
            Box("Upper_A", new Vector3(29,2.4f,0), new Vector3(5,.6f,3), floor);
            Box("Upper_B", new Vector3(37,3.5f,0), new Vector3(5,.6f,3), floor);
            Box("Upper_C", new Vector3(44,2.5f,0), new Vector3(4,.6f,3), floor);
            Box("Hazard_01", new Vector3(64,.35f,0), new Vector3(1.2f,.7f,3), dangerMaterial).AddComponent<Hazard>();
            Box("Hazard_02", new Vector3(76,.35f,0), new Vector3(1.2f,.7f,3), dangerMaterial).AddComponent<Hazard>();
            var positions = new[] {new Vector3(10,1.3f,0),new Vector3(20,1.3f,0),new Vector3(29,3.3f,0),
                new Vector3(37,4.8f,0),new Vector3(62,1.3f,0),new Vector3(82,1.3f,0)};
            var items = new List<Collectible>();
            for (int i=0;i<positions.Length;i++)
            {
                var item = GameObject.CreatePrimitive(PrimitiveType.Cube); item.name = $"Crystal_c{i+1:00}";
                item.transform.position = positions[i]; item.transform.localScale = Vector3.one * .5f;
                item.transform.rotation = Quaternion.Euler(0,0,35);
                UnityEngine.Object.DestroyImmediate(item.GetComponent<Collider>());
                item.GetComponent<Renderer>().sharedMaterial = coinMaterial;
                var collect = item.AddComponent<Collectible>(); collect.collectibleId = $"c{i+1:00}"; items.Add(collect);
            }
            var finish = Box("FinishBeacon", new Vector3(86,1.2f,0), new Vector3(.5f,2.4f,.5f), coinMaterial);
            UnityEngine.Object.DestroyImmediate(finish.GetComponent<Collider>());
            session.bridge = bridge; session.runner = motor; session.collectibles = items.ToArray(); session.finish = finish.transform;
            var camera = new GameObject("Main Camera").AddComponent<Camera>(); camera.tag = "MainCamera";
            camera.orthographic = true; camera.orthographicSize = 6.5f;
            camera.backgroundColor = new Color(.1f,.16f,.2f); camera.clearFlags = CameraClearFlags.SolidColor;
            camera.transform.position = new Vector3(2,6.7f,-16f); camera.transform.LookAt(new Vector3(2,1.7f,0));
            camera.gameObject.AddComponent<AudioListener>();
            camera.gameObject.AddComponent<FollowCamera>().target = player.transform;
            var light = new GameObject("Sun").AddComponent<Light>(); light.type = LightType.Directional;
            light.intensity = 1.3f; light.shadows = LightShadows.None; light.transform.rotation = Quaternion.Euler(45,-30,0);
            RenderSettings.ambientLight = new Color(.6f,.65f,.7f);
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] {new EditorBuildSettingsScene(ScenePath,true)};
            AssetDatabase.SaveAssets();
            Debug.Log("Greybox creado. Pulsa Play e Iniciar práctica local. Validación Unity pendiente hasta ejecutarla.");
        }
        private static GameObject Box(string name, Vector3 position, Vector3 scale, Material material)
        {
            var box = GameObject.CreatePrimitive(PrimitiveType.Cube); box.name = name;
            box.transform.position = position; box.transform.localScale = scale;
            box.GetComponent<Renderer>().sharedMaterial = material;
            return box;
        }
        private static Material Material(string name, Color color)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) throw new InvalidOperationException("Crea el proyecto con la plantilla Universal 3D (URP).");
            var material = new Material(shader) { color = color };
            AssetDatabase.CreateAsset(material, Root + "/" + name + ".mat"); return material;
        }
    }
}
