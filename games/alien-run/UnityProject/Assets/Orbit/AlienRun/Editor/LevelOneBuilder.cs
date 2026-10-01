using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Orbit.AlienRun.Editor
{
    public static class LevelOneBuilder
    {
        public const string ScenePath = KayKitPilotBuilder.LocalRoot + "/AlienRunLevelOne.unity";

        [MenuItem("Orbit/Alien Run/Create Local Level One")]
        public static void CreateLevelOne()
        {
            if (File.Exists(ScenePath))
                throw new InvalidOperationException("El nivel local ya existe; se conserva sin sobrescribirlo.");
            if (!File.Exists(KayKitEnvironmentBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero la variante de ambiente.", KayKitEnvironmentBuilder.ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            var scene = EditorSceneManager.OpenScene(KayKitEnvironmentBuilder.ScenePath, OpenSceneMode.Single);
            if (GameObject.Find("LevelOneGameplay") != null)
                throw new InvalidOperationException("La escena de origen ya contiene este nivel.");
            var session = UnityEngine.Object.FindFirstObjectByType<RunSession>();
            if (session == null || session.collectibles == null || session.collectibles.Length != 6)
                throw new InvalidOperationException("El nivel requiere los seis coleccionables originales.");
            var root = new GameObject("LevelOneGameplay");
            session.requiredCollectibles = 3;
            session.collectibleLabel = "MONEDAS";

            var gold = NewMaterial("LevelOneGold", new Color(1f, .72f, .16f));
            var core = NewMaterial("PatrolCore", new Color(.82f, .12f, .17f));
            var eye = NewMaterial("PatrolEye", new Color(.92f, .96f, .94f));
            foreach (var collectible in session.collectibles)
            {
                if (collectible == null || collectible.GetComponent<MeshRenderer>() == null)
                    throw new InvalidOperationException("Falta un coleccionable del nivel.");
                collectible.GetComponent<MeshRenderer>().enabled = false;
                var coin = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                coin.name = "CoinVisual_" + collectible.collectibleId;
                coin.transform.SetParent(collectible.transform, false);
                coin.transform.localPosition = Vector3.zero;
                coin.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                coin.transform.localScale = new Vector3(1.2f, .12f, 1.2f);
                UnityEngine.Object.DestroyImmediate(coin.GetComponent<Collider>());
                coin.GetComponent<MeshRenderer>().sharedMaterial = gold;
                coin.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }

            var drone = new GameObject("PatrolDrone_UpperRoute");
            drone.transform.SetParent(root.transform, false);
            drone.transform.position = new Vector3(35f, 4.7f, 0f);
            var patrol = drone.AddComponent<PatrolEnemy>();
            patrol.session = session;
            patrol.leftX = 35f;
            patrol.rightX = 39f;
            patrol.speed = 1.6f;
            AddSphere(drone.transform, "Core", Vector3.zero, new Vector3(.85f, .85f, .65f), core);
            AddSphere(drone.transform, "Eye_Left", new Vector3(-.17f, .08f, -.32f), Vector3.one * .12f, eye);
            AddSphere(drone.transform, "Eye_Right", new Vector3(.17f, .08f, -.32f), Vector3.one * .12f, eye);

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new InvalidOperationException("No se pudo guardar el nivel local.");
            AssetDatabase.SaveAssets();
            Debug.Log("Level one saved: " + ScenePath);
        }

        [MenuItem("Orbit/Alien Run/Resize Local Level One Coins")]
        public static void ResizeExistingCoins()
        {
            if (!File.Exists(ScenePath)) throw new FileNotFoundException("Falta el nivel local.", ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            var session = UnityEngine.Object.FindFirstObjectByType<RunSession>();
            if (session == null || session.collectibles == null || session.collectibles.Length != 6)
                throw new InvalidOperationException("El nivel local no tiene seis monedas.");
            foreach (var collectible in session.collectibles)
            {
                var coin = collectible.transform.Find("CoinVisual_" + collectible.collectibleId);
                if (coin == null || Vector3.Distance(coin.localScale, new Vector3(.38f, .07f, .38f)) > .001f)
                    throw new InvalidOperationException("La moneda local ya cambió: " + collectible.collectibleId);
                coin.localScale = new Vector3(1.2f, .12f, 1.2f);
            }
            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene)) throw new InvalidOperationException("No se pudo guardar el nivel.");
            Debug.Log("Level one coin visuals resized in " + ScenePath);
        }

        private static void AddSphere(Transform parent, string name, Vector3 position, Vector3 scale, Material material)
        {
            var visual = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            visual.name = name;
            visual.transform.SetParent(parent, false);
            visual.transform.localPosition = position;
            visual.transform.localScale = scale;
            UnityEngine.Object.DestroyImmediate(visual.GetComponent<Collider>());
            var renderer = visual.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        private static Material NewMaterial(string name, Color color)
        {
            var path = KayKitPilotBuilder.LocalRoot + "/" + name + ".mat";
            if (File.Exists(path)) throw new InvalidOperationException("El material local ya existe: " + path);
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) throw new InvalidOperationException("Falta URP/Lit.");
            var material = new Material(shader) { name = name };
            material.SetColor("_BaseColor", color);
            AssetDatabase.CreateAsset(material, path);
            return material;
        }
    }
}
