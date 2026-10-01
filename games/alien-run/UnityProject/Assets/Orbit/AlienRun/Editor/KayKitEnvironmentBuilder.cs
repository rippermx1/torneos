using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Orbit.AlienRun.Editor
{
    public static class KayKitEnvironmentBuilder
    {
        public const string ScenePath = KayKitPilotBuilder.LocalRoot + "/AlienRunKayKitEnvironment.unity";
        private const string PackRoot = "Assets/KayKit/Packs/KayKit - Platformer Pack (for Unity)";

        [MenuItem("Orbit/Alien Run/Create Local Environment Stage")]
        public static void CreateEnvironmentStage()
        {
            if (File.Exists(ScenePath))
                throw new InvalidOperationException("La variante de ambiente ya existe; se conserva sin sobrescribirla.");
            if (!File.Exists(KayKitPolishBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero la variante pulida.", KayKitPolishBuilder.ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            var spikes = AssetDatabase.LoadAssetAtPath<GameObject>(PackRoot + "/Prefabs/neutral/floor_spikes_2x2x1.prefab");
            var pillar = AssetDatabase.LoadAssetAtPath<GameObject>(PackRoot + "/Prefabs/neutral/pillar_1x1x2.prefab");
            var kitMaterial = AssetDatabase.LoadAssetAtPath<Material>(KayKitPilotBuilder.LocalRoot + "/PlatformerURP.mat");
            if (spikes == null || pillar == null || kitMaterial == null)
                throw new InvalidOperationException("Faltan prefabs KayKit o su material URP local.");
            var scene = EditorSceneManager.OpenScene(KayKitPolishBuilder.ScenePath, OpenSceneMode.Single);
            if (GameObject.Find("KayKitEnvironment") != null)
                throw new InvalidOperationException("La escena de origen ya tiene esta decoración.");
            var root = new GameObject("KayKitEnvironment");
            var warning = NewMaterial("WarningAmber", new Color(1f, .67f, .18f));
            var accent = NewMaterial("CheckpointCyan", new Color(.22f, .83f, .78f));
            var sunMat = NewMaterial("DistantSun", new Color(1f, .82f, .49f));

            foreach (var name in new[] { "Hazard_01", "Hazard_02" })
            {
                var hazard = GameObject.Find(name);
                var hitbox = hazard != null ? hazard.GetComponent<BoxCollider>() : null;
                var grey = hazard != null ? hazard.GetComponent<MeshRenderer>() : null;
                if (hitbox == null || grey == null || hazard.GetComponent<Hazard>() == null || !hitbox.enabled)
                    throw new InvalidOperationException("Falta peligro con collider activo: " + name);
                var visual = (GameObject)PrefabUtility.InstantiatePrefab(spikes);
                visual.name = "KayKit_" + name + "_Spikes";
                visual.transform.SetParent(root.transform, true);
                FitToBounds(visual, hitbox.bounds);
                MakeDecorative(visual, kitMaterial);
                grey.enabled = false;

                var x = hitbox.bounds.min.x - 2.1f;
                for (var stripe = 0; stripe < 2; stripe++)
                    DecorativeBox(root.transform, name + "_Warning_" + stripe,
                        new Vector3(x + stripe * .48f, .025f, -.1f), new Vector3(.22f, .05f, 3.1f), warning);
            }

            // Un hito detrás del plano jugable identifica el checkpoint sin agregar contacto físico.
            foreach (var x in new[] { 45f, 47f })
            {
                var visual = (GameObject)PrefabUtility.InstantiatePrefab(pillar);
                visual.name = "Checkpoint_Pillar_" + x;
                visual.transform.SetParent(root.transform, true);
                FitToBounds(visual, new Bounds(new Vector3(x, 1.25f, 2.6f), new Vector3(.7f, 2.5f, .7f)));
                MakeDecorative(visual, kitMaterial);
            }
            DecorativeBox(root.transform, "Checkpoint_Cap", new Vector3(46f, 2.7f, 2.6f),
                new Vector3(2.9f, .16f, .55f), accent);

            // Elementos lejanos y de bajo costo: no tapan la ruta ni proyectan sombras.
            var sun = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            sun.name = "Distant_Sun";
            sun.transform.SetParent(root.transform, true);
            sun.transform.position = new Vector3(15f, 7.7f, 18f);
            sun.transform.localScale = new Vector3(5f, 5f, .35f);
            UnityEngine.Object.DestroyImmediate(sun.GetComponent<Collider>());
            sun.GetComponent<MeshRenderer>().sharedMaterial = sunMat;
            sun.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new InvalidOperationException("No se pudo guardar la variante de ambiente.");
            AssetDatabase.SaveAssets();
            Debug.Log("KayKit environment stage saved: " + ScenePath);
        }

        private static Material NewMaterial(string name, Color color)
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

        private static void DecorativeBox(Transform parent, string name, Vector3 position, Vector3 scale, Material material)
        {
            var visual = GameObject.CreatePrimitive(PrimitiveType.Cube);
            visual.name = name;
            visual.transform.SetParent(parent, true);
            visual.transform.position = position;
            visual.transform.localScale = scale;
            UnityEngine.Object.DestroyImmediate(visual.GetComponent<Collider>());
            visual.GetComponent<MeshRenderer>().sharedMaterial = material;
        }

        private static void FitToBounds(GameObject visual, Bounds target)
        {
            var source = RendererBounds(visual);
            if (source.size.x <= 0 || source.size.y <= 0 || source.size.z <= 0)
                throw new InvalidOperationException("Prefab KayKit sin dimensiones válidas.");
            visual.transform.localScale = new Vector3(target.size.x / source.size.x,
                target.size.y / source.size.y, target.size.z / source.size.z);
            visual.transform.position += target.center - RendererBounds(visual).center;
        }

        private static Bounds RendererBounds(GameObject visual)
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
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            foreach (var collider in visual.GetComponentsInChildren<Collider>(true)) collider.enabled = false;
            foreach (var body in visual.GetComponentsInChildren<Rigidbody>(true)) body.isKinematic = true;
        }
    }
}
