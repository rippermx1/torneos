using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Orbit.AlienRun.Editor
{
    public static class KayKitSectionBuilder
    {
        public const string ScenePath = KayKitPilotBuilder.LocalRoot + "/AlienRunKayKitSection.unity";
        private const string PackRoot = "Assets/KayKit/Packs/KayKit - Platformer Pack (for Unity)/Prefabs/neutral";

        [MenuItem("Orbit/Alien Run/Create Local KayKit Section")]
        public static void CreateSection()
        {
            if (File.Exists(ScenePath))
                throw new InvalidOperationException("La sección KayKit ya existe; se conserva sin sobrescribirla.");
            if (!File.Exists(LevelDesignBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero la variante de diseño de nivel.", LevelDesignBuilder.ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            var spikedBlock = AssetDatabase.LoadAssetAtPath<GameObject>(PackRoot + "/floor_spikes_2x2x1.prefab");
            var routeSign = AssetDatabase.LoadAssetAtPath<GameObject>(PackRoot + "/signage_arrows_right.prefab");
            var pillar = AssetDatabase.LoadAssetAtPath<GameObject>(PackRoot + "/pillar_1x1x2.prefab");
            var kitMaterial = AssetDatabase.LoadAssetAtPath<Material>(KayKitPilotBuilder.LocalRoot + "/PlatformerURP.mat");
            var warning = AssetDatabase.LoadAssetAtPath<Material>(KayKitPilotBuilder.LocalRoot + "/LevelDesignGapAmber.mat");
            if (spikedBlock == null || routeSign == null || pillar == null || kitMaterial == null || warning == null)
                throw new InvalidOperationException("Faltan piezas KayKit o materiales URP locales.");

            var scene = EditorSceneManager.OpenScene(LevelDesignBuilder.ScenePath, OpenSceneMode.Single);
            if (GameObject.Find("KayKitPlayableSection") != null)
                throw new InvalidOperationException("La escena de origen ya contiene esta sección.");
            foreach (var name in new[] { "Upper_A", "Upper_B", "Upper_C" })
            {
                var platform = GameObject.Find(name);
                if (platform == null || platform.GetComponent<BoxCollider>() == null ||
                    !platform.GetComponent<BoxCollider>().enabled)
                    throw new InvalidOperationException("Falta la ruta elevada: " + name);
            }
            var session = UnityEngine.Object.FindFirstObjectByType<RunSession>();
            if (session == null || session.RequiredCollectibles != 3)
                throw new InvalidOperationException("Falta el objetivo del nivel.");

            var root = new GameObject("KayKitPlayableSection");
            // El bloque es un peligro jugable propio. El prefab comercial aporta solo la silueta.
            var hazard = GameObject.CreatePrimitive(PrimitiveType.Cube);
            hazard.name = "Hazard_KayKitOpeningSpikes";
            hazard.transform.SetParent(root.transform, true);
            hazard.transform.position = new Vector3(6f, .55f, 0f);
            hazard.transform.localScale = new Vector3(1.35f, 1.1f, 2.8f);
            hazard.AddComponent<Hazard>();
            var hitbox = hazard.GetComponent<BoxCollider>();
            hazard.GetComponent<MeshRenderer>().enabled = false;
            var visual = InstantiateDecorative(spikedBlock, root.transform, "KayKit_OpeningSpikes", kitMaterial);
            FitToBounds(visual, hitbox.bounds);

            for (var i = 0; i < 3; i++)
                DecorativeBox(root.transform, "HammerWarning_" + i,
                    new Vector3(3f + i * .42f, .045f, -.12f),
                    new Vector3(.18f, .09f, 2.7f), warning);

            // El acceso a las plataformas altas se anuncia detrás del plano jugable.
            var support = InstantiateDecorative(pillar, root.transform, "KayKit_BranchPillar", kitMaterial);
            FitToBounds(support, new Bounds(new Vector3(26.2f, 1.2f, 2.6f), new Vector3(.55f, 2.4f, .55f)));
            var sign = InstantiateDecorative(routeSign, root.transform, "KayKit_BranchSign", kitMaterial);
            FitToBounds(sign, new Bounds(new Vector3(26.2f, 2.6f, 2.45f), new Vector3(1.65f, .9f, .5f)));
            session.extraGuidedJumpX = 3.5f;

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new InvalidOperationException("No se pudo guardar la sección KayKit.");
            AssetDatabase.SaveAssets();
            Debug.Log("KayKit playable section saved: " + ScenePath);
        }

        private static GameObject InstantiateDecorative(GameObject prefab, Transform parent, string name, Material material)
        {
            var visual = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            visual.name = name;
            visual.transform.SetParent(parent, true);
            foreach (var renderer in visual.GetComponentsInChildren<Renderer>(true))
            {
                var materials = renderer.sharedMaterials;
                for (var i = 0; i < materials.Length; i++) materials[i] = material;
                renderer.sharedMaterials = materials;
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            foreach (var collider in visual.GetComponentsInChildren<Collider>(true)) collider.enabled = false;
            foreach (var body in visual.GetComponentsInChildren<Rigidbody>(true)) body.isKinematic = true;
            return visual;
        }

        private static void FitToBounds(GameObject visual, Bounds target)
        {
            var source = RendererBounds(visual);
            if (source.size.x <= 0 || source.size.y <= 0 || source.size.z <= 0)
                throw new InvalidOperationException("Prefab KayKit sin dimensiones válidas: " + visual.name);
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

        private static void DecorativeBox(Transform parent, string name, Vector3 position, Vector3 scale, Material material)
        {
            var visual = GameObject.CreatePrimitive(PrimitiveType.Cube);
            visual.name = name;
            visual.transform.SetParent(parent, true);
            visual.transform.position = position;
            visual.transform.localScale = scale;
            UnityEngine.Object.DestroyImmediate(visual.GetComponent<Collider>());
            visual.GetComponent<MeshRenderer>().sharedMaterial = material;
            visual.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }
    }
}
