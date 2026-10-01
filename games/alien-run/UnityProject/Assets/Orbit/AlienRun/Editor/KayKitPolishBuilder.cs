using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Orbit.AlienRun.Editor
{
    public static class KayKitPolishBuilder
    {
        public const string ScenePath = KayKitPilotBuilder.LocalRoot + "/AlienRunKayKitPolished.unity";
        private const string PackRoot = "Assets/KayKit/Packs/KayKit - Platformer Pack (for Unity)";

        [MenuItem("Orbit/Alien Run/Create Local Polished Stage")]
        public static void CreatePolishedStage()
        {
            if (File.Exists(ScenePath))
                throw new InvalidOperationException("La variante pulida ya existe; se conserva sin sobrescribirla.");
            if (!File.Exists(KayKitStageBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero la variante KayKit de escenario.", KayKitStageBuilder.ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            var floor = AssetDatabase.LoadAssetAtPath<GameObject>(PackRoot + "/Prefabs/neutral/floor_wood_4x4.prefab");
            var material = AssetDatabase.LoadAssetAtPath<Material>(KayKitPilotBuilder.LocalRoot + "/PlatformerURP.mat");
            if (floor == null || material == null)
                throw new InvalidOperationException("Faltan el piso KayKit o el material URP local.");
            var scene = EditorSceneManager.OpenScene(KayKitStageBuilder.ScenePath, OpenSceneMode.Single);
            if (GameObject.Find("KayKitPolish") != null)
                throw new InvalidOperationException("La escena de origen ya contiene el pulido visual.");

            var root = new GameObject("KayKitPolish");
            foreach (var name in new[] { "Ground_A", "Ground_B", "Ground_C" })
            {
                var ground = GameObject.Find(name);
                var collider = ground != null ? ground.GetComponent<BoxCollider>() : null;
                var renderer = ground != null ? ground.GetComponent<MeshRenderer>() : null;
                if (collider == null || renderer == null || !collider.enabled)
                    throw new InvalidOperationException("Falta suelo de gameplay o collider activo: " + name);
                var bounds = collider.bounds;
                var count = Mathf.CeilToInt(bounds.size.x / 4f);
                for (var i = 0; i < count; i++)
                {
                    var left = bounds.min.x + i * bounds.size.x / count;
                    var tileBounds = new Bounds(
                        new Vector3(left + bounds.size.x / count * .5f, bounds.center.y, bounds.center.z),
                        new Vector3(bounds.size.x / count, bounds.size.y, bounds.size.z));
                    var visual = (GameObject)PrefabUtility.InstantiatePrefab(floor);
                    visual.name = "KayKit_" + name + "_" + (i + 1);
                    visual.transform.SetParent(root.transform, true);
                    FitToBounds(visual, tileBounds);
                    MakeDecorative(visual, material);
                }
                renderer.enabled = false;
            }

            var camera = Camera.main;
            if (camera == null) throw new InvalidOperationException("Falta la cámara principal.");
            camera.backgroundColor = new Color(.38f, .57f, .67f);
            RenderSettings.ambientLight = new Color(.72f, .78f, .82f);
            var sun = GameObject.Find("Sun")?.GetComponent<Light>();
            if (sun != null) { sun.intensity = 1.55f; sun.color = new Color(1f, .93f, .79f); }

            // El fondo se sitúa detrás de la ruta y no participa en física.
            var backdrop = NewMat("BackdropSlate", new Color(.21f, .37f, .43f));
            var distant = NewMat("DistantTeal", new Color(.32f, .50f, .50f));
            var danger = NewMat("DangerCoral", new Color(1f, .27f, .12f));
            AddBackdrop(root.transform, backdrop, distant);
            foreach (var name in new[] { "Hazard_01", "Hazard_02" })
            {
                var hazard = GameObject.Find(name);
                if (hazard == null || hazard.GetComponent<Hazard>() == null)
                    throw new InvalidOperationException("Falta peligro de gameplay: " + name);
                hazard.GetComponent<MeshRenderer>().sharedMaterial = danger;
            }

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new InvalidOperationException("No se pudo guardar la variante pulida.");
            AssetDatabase.SaveAssets();
            Debug.Log("KayKit polished stage saved: " + ScenePath);
        }

        private static void AddBackdrop(Transform parent, Material near, Material far)
        {
            for (var i = 0; i < 12; i++)
            {
                var x = i * 9f - 6f;
                DecorativeBox(parent, "Distant_Block_" + i,
                    new Vector3(x, -1.2f + (i % 3) * .35f, 12f),
                    new Vector3(6.5f, 2.6f + (i % 3) * .7f, 1f), far);
            }
            DecorativeBox(parent, "Back_Ridge", new Vector3(43f, -4.1f, 8f), new Vector3(106f, 6f, 1f), near);
        }

        private static void DecorativeBox(Transform parent, string name, Vector3 position, Vector3 scale, Material material)
        {
            var visual = GameObject.CreatePrimitive(PrimitiveType.Cube);
            visual.name = name; visual.transform.SetParent(parent, true);
            visual.transform.position = position; visual.transform.localScale = scale;
            UnityEngine.Object.DestroyImmediate(visual.GetComponent<Collider>());
            visual.GetComponent<MeshRenderer>().sharedMaterial = material;
        }

        private static Material NewMat(string name, Color color)
        {
            var path = KayKitPilotBuilder.LocalRoot + "/" + name + ".mat";
            if (File.Exists(path)) throw new InvalidOperationException("El material local ya existe: " + path);
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) throw new InvalidOperationException("Falta shader URP/Lit.");
            var material = new Material(shader) { name = name };
            material.SetColor("_BaseColor", color);
            AssetDatabase.CreateAsset(material, path);
            return material;
        }

        private static void FitToBounds(GameObject visual, Bounds target)
        {
            var source = BoundsOf(visual);
            if (source.size.x <= 0 || source.size.y <= 0 || source.size.z <= 0)
                throw new InvalidOperationException("Piso KayKit sin dimensiones válidas.");
            visual.transform.localScale = new Vector3(target.size.x / source.size.x,
                target.size.y / source.size.y, target.size.z / source.size.z);
            visual.transform.position += target.center - BoundsOf(visual).center;
        }

        private static Bounds BoundsOf(GameObject visual)
        {
            var renderers = visual.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) throw new InvalidOperationException("Prefab KayKit sin renderers.");
            var bounds = renderers[0].bounds;
            for (var i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            return bounds;
        }

        private static void MakeDecorative(GameObject visual, Material material)
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
