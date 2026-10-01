using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Orbit.AlienRun.Editor
{
    public static class KayKitStageBuilder
    {
        public const string ScenePath = KayKitPilotBuilder.LocalRoot + "/AlienRunKayKitStagePilot.unity";
        private const string PackRoot = "Assets/KayKit/Packs/KayKit - Platformer Pack (for Unity)";
        private const string MaterialPath = KayKitPilotBuilder.LocalRoot + "/PlatformerURP.mat";

        [MenuItem("Orbit/Alien Run/Create Local KayKit Stage Pilot")]
        public static void CreateStagePilot()
        {
            if (File.Exists(ScenePath))
                throw new InvalidOperationException("La variante de escenario ya existe; se conserva sin sobrescribirla.");
            if (!File.Exists(KayKitPilotBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero el piloto Engineer.", KayKitPilotBuilder.ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            var floor = AssetDatabase.LoadAssetAtPath<GameObject>(PackRoot + "/Prefabs/neutral/floor_wood_4x4.prefab");
            var finishSign = AssetDatabase.LoadAssetAtPath<GameObject>(PackRoot + "/Prefabs/neutral/signage_finish.prefab");
            var sourceMaterial = AssetDatabase.LoadAssetAtPath<Material>(PackRoot + "/Materials/platformer.mat");
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (floor == null || finishSign == null || sourceMaterial == null || sourceMaterial.mainTexture == null || shader == null)
                throw new InvalidOperationException("Faltan prefabs, atlas o shader URP del Platformer Pack.");

            var material = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
            if (material == null)
            {
                material = new Material(shader) { name = "PlatformerURP" };
                material.SetColor("_BaseColor", Color.white);
                material.SetTexture("_BaseMap", sourceMaterial.mainTexture);
                AssetDatabase.CreateAsset(material, MaterialPath);
            }
            else if (material.shader != shader || material.GetTexture("_BaseMap") != sourceMaterial.mainTexture)
                throw new InvalidOperationException("El material local PlatformerURP existente tiene otra configuración.");

            var scene = EditorSceneManager.OpenScene(KayKitPilotBuilder.ScenePath, OpenSceneMode.Single);
            if (GameObject.Find("KayKitStage") != null)
                throw new InvalidOperationException("El piloto de origen ya contiene decoración KayKit.");
            var session = UnityEngine.Object.FindFirstObjectByType<RunSession>();
            if (session == null || session.finish == null)
                throw new InvalidOperationException("Falta la meta de gameplay en la escena de origen.");
            var stage = new GameObject("KayKitStage");
            foreach (var name in new[] { "Upper_A", "Upper_B", "Upper_C" })
            {
                var platform = GameObject.Find(name);
                var collider = platform != null ? platform.GetComponent<BoxCollider>() : null;
                var greyRenderer = platform != null ? platform.GetComponent<MeshRenderer>() : null;
                if (collider == null || greyRenderer == null || !collider.enabled)
                    throw new InvalidOperationException("Falta plataforma elevada o su collider: " + name);
                var visual = (GameObject)PrefabUtility.InstantiatePrefab(floor);
                visual.name = "KayKit_" + name;
                visual.transform.SetParent(stage.transform, true);
                FitVisualToBounds(visual, collider.bounds);
                PrepareVisual(visual, material);
                greyRenderer.enabled = false;
            }

            var beaconRenderer = session.finish.GetComponent<MeshRenderer>();
            if (beaconRenderer == null)
                throw new InvalidOperationException("Falta el renderer provisional de meta.");
            var sign = (GameObject)PrefabUtility.InstantiatePrefab(finishSign);
            sign.name = "KayKit_Finish";
            sign.transform.SetParent(stage.transform, true);
            var signBounds = RendererBounds(sign);
            var signScale = Mathf.Min(2.6f / signBounds.size.y, 2.7f / signBounds.size.x);
            sign.transform.localScale = Vector3.one * signScale;
            signBounds = RendererBounds(sign);
            sign.transform.position += new Vector3(session.finish.position.x - signBounds.center.x,
                -signBounds.min.y, 1.2f - signBounds.center.z);
            PrepareVisual(sign, material);
            beaconRenderer.enabled = false;

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new InvalidOperationException("No se pudo guardar la variante local del escenario.");
            AssetDatabase.SaveAssets();
            Debug.Log("KayKit stage pilot saved: " + ScenePath);
        }

        private static void FitVisualToBounds(GameObject visual, Bounds target)
        {
            var source = RendererBounds(visual);
            if (source.size.x <= 0 || source.size.y <= 0 || source.size.z <= 0)
                throw new InvalidOperationException("El prefab de suelo KayKit no tiene dimensiones válidas.");
            visual.transform.localScale = new Vector3(target.size.x / source.size.x,
                target.size.y / source.size.y, target.size.z / source.size.z);
            var scaled = RendererBounds(visual);
            visual.transform.position += target.center - scaled.center;
        }

        private static Bounds RendererBounds(GameObject visual)
        {
            var renderers = visual.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) throw new InvalidOperationException("Prefab KayKit sin renderers.");
            var bounds = renderers[0].bounds;
            for (var i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            return bounds;
        }

        private static void PrepareVisual(GameObject visual, Material material)
        {
            foreach (var renderer in visual.GetComponentsInChildren<Renderer>(true))
            {
                var materials = renderer.sharedMaterials;
                for (var i = 0; i < materials.Length; i++) materials[i] = material;
                renderer.sharedMaterials = materials;
            }
            foreach (var collider in visual.GetComponentsInChildren<Collider>(true)) collider.enabled = false;
            foreach (var body in visual.GetComponentsInChildren<Rigidbody>(true)) body.isKinematic = true;
        }
    }
}
