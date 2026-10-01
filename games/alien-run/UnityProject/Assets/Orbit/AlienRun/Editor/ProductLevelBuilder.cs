using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Orbit.AlienRun.Editor
{
    // Level layout lives here; purchased prefabs remain local and are never modified.
    public static class ProductLevelBuilder
    {
        public const string ScenePath = KayKitPilotBuilder.LocalRoot + "/AlienRunProductLevelV6.unity";
        private const string Prefabs = "Assets/KayKit/Packs/KayKit - Platformer Pack (for Unity)/Prefabs/";

        [MenuItem("Orbit/Alien Run/Create Local Product Level")]
        public static void CreateLevel()
        {
            if (File.Exists(ScenePath))
                throw new InvalidOperationException("El nivel local ya existe; se conserva sin sobrescribirlo.");
            if (!File.Exists(KayKitSectionBuilder.ScenePath))
                throw new FileNotFoundException("Falta la sección KayKit de origen.", KayKitSectionBuilder.ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            var floor = LoadPrefab("neutral/floor_wood_4x4");
            var spikes = LoadPrefab("neutral/floor_spikes_2x2x1");
            var saw = LoadPrefab("neutral/sawblade");
            var pillar = LoadPrefab("neutral/pillar_1x1x2");
            var barrier = LoadPrefab("neutral/barrier_1x1x4");
            var sign = LoadPrefab("neutral/signage_arrows_right");
            var archBlue = LoadPrefab("blue/arch_wide_blue");
            var archGreen = LoadPrefab("green/arch_wide_green");
            var archRed = LoadPrefab("red/arch_wide_red");
            var archYellow = LoadPrefab("yellow/arch_wide_yellow");
            var wood = LoadMaterial("PlatformerURP");
            var blue = TintMaterial("LevelArchBlue", wood, new Color(.34f, .75f, 1f));
            var green = TintMaterial("LevelArchGreen", wood, new Color(.47f, .9f, .65f));
            var yellow = TintMaterial("LevelArchYellow", wood, new Color(1f, .78f, .4f));
            var red = TintMaterial("LevelArchRed", wood, new Color(1f, .48f, .42f));
            var gold = LoadMaterial("LevelOneGold");
            var rim = LoadMaterial("LevelDesignFloorRim");
            var amber = LoadMaterial("LevelDesignGapAmber");
            var landing = LoadMaterial("LevelDesignLanding");
            var far = LoadMaterial("LevelDesignDistant");
            var near = LoadMaterial("LevelDesignMid");

            var scene = EditorSceneManager.OpenScene(KayKitSectionBuilder.ScenePath, OpenSceneMode.Single);
            var session = UnityEngine.Object.FindFirstObjectByType<RunSession>();
            if (session == null || session.collectibles == null || session.collectibles.Length != 6 ||
                session.finish == null || GameObject.Find("ProductLevel") != null)
                throw new InvalidOperationException("La escena de origen no coincide con el nivel esperado.");
            var root = new GameObject("ProductLevel").transform;

            // Cuatro tramos: aprendizaje, bifurcación, peligro móvil y cierre. Los huecos
            // y hitboxes son nuestros; los prefabs aportan silueta, material y detalles.
            Ground(root, "Ground_D_Approach", 88f, 126f, floor, wood);
            Ground(root, "Ground_E_Branch", 130f, 174f, floor, wood);
            Ground(root, "Ground_F_Moving", 178f, 222f, floor, wood);
            Ground(root, "Ground_G_Finale", 226f, 286f, floor, wood);
            Platform(root, "Upper_D_01", 109f, 114f, 2.7f, floor, pillar, wood);
            Platform(root, "Upper_D_02", 117f, 122f, 3.55f, floor, pillar, wood);
            Platform(root, "Upper_E_01", 141f, 146f, 2.7f, floor, pillar, wood);
            Platform(root, "Upper_E_02", 149f, 154f, 3.55f, floor, pillar, wood);
            Platform(root, "Upper_F_01", 199f, 204f, 2.7f, floor, pillar, wood);
            Platform(root, "Upper_F_02", 207f, 212f, 3.55f, floor, pillar, wood);
            Platform(root, "Upper_G_01", 251f, 256f, 2.7f, floor, pillar, wood);
            Platform(root, "Upper_G_02", 259f, 264f, 3.55f, floor, pillar, wood);

            Spike(root, "Hazard_Approach", 104f, spikes, wood);
            Spike(root, "Hazard_Branch", 160f, spikes, wood);
            Spike(root, "Hazard_Finale_01", 248f, spikes, wood);
            Spike(root, "Hazard_Finale_02", 270f, spikes, wood);
            var movingSaw = new GameObject("PatrolSaw_Ground");
            movingSaw.transform.SetParent(root, false);
            movingSaw.transform.position = new Vector3(194f, 1.05f, 0f);
            var patrol = movingSaw.AddComponent<PatrolEnemy>();
            patrol.session = session; patrol.leftX = 194f; patrol.rightX = 196f;
            patrol.speed = 1.7f; patrol.hitRadius = .78f;
            var sawVisual = Visual(saw, movingSaw.transform, "KayKit_MovingSaw", wood,
                new Bounds(movingSaw.transform.position, new Vector3(1.2f, 1.2f, .45f)),
                Quaternion.Euler(90f, 0f, 0f));
            sawVisual.AddComponent<VisualSpinner>().degreesPerSecond = 240f;
            var vault = GameObject.CreatePrimitive(PrimitiveType.Cube);
            vault.name = "Barrier_FinalVault"; vault.transform.SetParent(root, false);
            vault.transform.position = new Vector3(238f, .6f, 0f);
            vault.transform.localScale = new Vector3(1f, 1.2f, 2.8f);
            vault.GetComponent<MeshRenderer>().enabled = false;
            Visual(barrier, root, "KayKit_FinalVault", wood,
                new Bounds(vault.transform.position, vault.transform.localScale));

            var items = new List<Collectible>(session.collectibles);
            Coin(root, items, "c07", 93f, 1.3f, gold);
            Coin(root, items, "c08", 119f, 4.2f, gold); // ruta elevada
            Coin(root, items, "c09", 135f, 1.3f, gold);
            Coin(root, items, "c10", 167f, 1.3f, gold);
            Coin(root, items, "c11", 182f, 1.3f, gold);
            Coin(root, items, "c12", 209f, 4.2f, gold); // ruta elevada
            Coin(root, items, "c13", 232f, 1.3f, gold);
            Coin(root, items, "c14", 280f, 1.3f, gold);
            session.collectibles = items.ToArray();
            session.requiredCollectibles = 8;
            session.laterCheckpoints = new[] { new Vector3(136f, 2f, 0f), new Vector3(231f, 2f, 0f) };
            session.laterGuidedJumps = new[] { 101f, 124f, 157f, 172f, 190f, 220f, 235f, 245f, 267f };

            foreach (var section in new[] { new Vector2(88f, 126f), new Vector2(130f, 174f),
                new Vector2(178f, 222f), new Vector2(226f, 286f) })
                Box(root, "FloorRim_" + section.x, new Vector3((section.x + section.y) * .5f, .035f, -1.46f),
                    new Vector3(section.y - section.x, .08f, .16f), rim);
            foreach (var x in new[] { 125.5f, 173.5f, 221.5f })
                Box(root, "GapTakeoff_" + x, new Vector3(x, .045f, -.12f), new Vector3(.7f, .09f, 2.7f), amber);
            foreach (var x in new[] { 130.7f, 178.7f, 226.7f })
                Box(root, "GapLanding_" + x, new Vector3(x, .045f, -.12f), new Vector3(.85f, .09f, 2.7f), landing);
            foreach (var x in new[] { 100.5f, 156.5f, 244.5f, 266.5f })
                for (var i = 0; i < 3; i++)
                    Box(root, "DangerWarning_" + x + "_" + i,
                        new Vector3(x + i * .45f, .045f, -.13f), new Vector3(.17f, .09f, 2.65f), amber);

            // Los arcos codifican las zonas y los checkpoints. Se sitúan detrás del plano jugable.
            Visual(archBlue, root, "KayKit_EntryArch", blue,
                new Bounds(new Vector3(91f, 1.75f, 2.8f), new Vector3(3.6f, 3.5f, .7f)));
            Visual(archGreen, root, "KayKit_CheckpointTwo", green,
                new Bounds(new Vector3(136f, 1.75f, 2.8f), new Vector3(3.6f, 3.5f, .7f)));
            Visual(archYellow, root, "KayKit_MovingZone", yellow,
                new Bounds(new Vector3(181f, 1.75f, 2.8f), new Vector3(3.6f, 3.5f, .7f)));
            Visual(archRed, root, "KayKit_FinalZone", red,
                new Bounds(new Vector3(231f, 1.75f, 2.8f), new Vector3(3.6f, 3.5f, .7f)));
            Visual(archGreen, root, "KayKit_FinishArch", green,
                new Bounds(new Vector3(282f, 1.9f, 2.8f), new Vector3(4.1f, 3.8f, .7f)));
            Visual(sign, root, "KayKit_SecondRouteSign", wood,
                new Bounds(new Vector3(139f, 2.4f, 2.45f), new Vector3(1.8f, .9f, .5f)));
            Visual(sign, root, "KayKit_FinalRouteSign", wood,
                new Bounds(new Vector3(242f, 2.4f, 2.45f), new Vector3(1.8f, .9f, .5f)));

            var finishX = 282f;
            var oldX = session.finish.position.x;
            session.finish.position = new Vector3(finishX, session.finish.position.y, session.finish.position.z);
            var finishVisual = GameObject.Find("KayKit_Finish");
            if (finishVisual == null) throw new InvalidOperationException("Falta el visual KayKit de la meta.");
            finishVisual.transform.position += Vector3.right * (finishX - oldX);
            var camera = Camera.main?.GetComponent<FollowCamera>();
            if (camera == null) throw new InvalidOperationException("Falta la cámara del nivel.");
            camera.maxFocusX = 280f;

            var design = GameObject.Find("LevelDesign")?.transform;
            var ridge = GameObject.Find("Back_Ridge");
            if (design == null || ridge == null) throw new InvalidOperationException("Falta fondo de la escena de origen.");
            ridge.transform.position = new Vector3(140f, ridge.transform.position.y, ridge.transform.position.z);
            ridge.transform.localScale = new Vector3(300f, ridge.transform.localScale.y, ridge.transform.localScale.z);
            for (var i = 12; i < 34; i++)
                Sphere(root, "FarHill_" + i, new Vector3(-9f + i * 9f, -4.35f + (i % 3) * .18f, 18f),
                    new Vector3(12f, 3.2f + (i % 3) * .35f, 1.1f), far);
            for (var i = 10; i < 28; i++)
                Sphere(root, "NearHill_" + i, new Vector3(-8f + i * 11f, -4.6f + (i % 2) * .2f, 11f),
                    new Vector3(13f, 3.4f + (i % 3) * .3f, 1.2f), near);

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new InvalidOperationException("No se pudo guardar el nivel.");
            AssetDatabase.SaveAssets();
            Debug.Log("Product level saved: " + ScenePath);
        }

        internal static GameObject LoadPrefab(string id)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Prefabs + id + ".prefab");
            if (prefab == null) throw new FileNotFoundException("Falta prefab KayKit: " + id);
            return prefab;
        }

        internal static Material LoadMaterial(string id)
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(KayKitPilotBuilder.LocalRoot + "/" + id + ".mat");
            if (material == null) throw new FileNotFoundException("Falta material local: " + id);
            return material;
        }

        internal static Material TintMaterial(string id, Material source, Color tint)
        {
            var path = KayKitPilotBuilder.LocalRoot + "/" + id + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material != null) return material;
            material = new Material(source) { name = id };
            material.SetColor("_BaseColor", tint);
            AssetDatabase.CreateAsset(material, path);
            return material;
        }

        internal static void Ground(Transform root, string id, float left, float right, GameObject prefab, Material material)
        {
            var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.name = id; ground.transform.SetParent(root, false);
            ground.transform.position = new Vector3((left + right) * .5f, -.5f, 0f);
            ground.transform.localScale = new Vector3(right - left, 1f, 4f);
            ground.GetComponent<MeshRenderer>().enabled = false;
            var count = Mathf.CeilToInt((right - left) / 4f);
            for (var i = 0; i < count; i++)
            {
                var width = (right - left) / count;
                Visual(prefab, root, "KayKit_" + id + "_" + i, material,
                    new Bounds(new Vector3(left + (i + .5f) * width, -.5f, 0f), new Vector3(width, 1f, 4f)));
            }
        }

        internal static void Platform(Transform root, string id, float left, float right, float top,
            GameObject prefab, GameObject pillar, Material material)
        {
            var upper = GameObject.CreatePrimitive(PrimitiveType.Cube);
            upper.name = id; upper.transform.SetParent(root, false);
            upper.transform.position = new Vector3((left + right) * .5f, top - .3f, 0f);
            upper.transform.localScale = new Vector3(right - left, .6f, 3f);
            upper.GetComponent<MeshRenderer>().enabled = false;
            Visual(prefab, root, "KayKit_" + id, material,
                new Bounds(upper.transform.position, upper.transform.localScale));
            foreach (var x in new[] { left + .5f, right - .5f })
                Visual(pillar, root, "KayKit_" + id + "_Support_" + x, material,
                    new Bounds(new Vector3(x, top * .5f, 2.3f), new Vector3(.46f, top, .46f)));
        }

        internal static void Spike(Transform root, string id, float x, GameObject prefab, Material material)
        {
            var hazard = GameObject.CreatePrimitive(PrimitiveType.Cube);
            hazard.name = id; hazard.transform.SetParent(root, false);
            hazard.transform.position = new Vector3(x, .55f, 0f);
            hazard.transform.localScale = new Vector3(1.3f, 1.1f, 2.8f);
            hazard.GetComponent<MeshRenderer>().enabled = false;
            hazard.AddComponent<Hazard>();
            Visual(prefab, root, "KayKit_" + id, material,
                new Bounds(hazard.transform.position, hazard.transform.localScale));
        }

        internal static void Coin(Transform root, List<Collectible> items, string id, float x, float y, Material gold)
        {
            var item = GameObject.CreatePrimitive(PrimitiveType.Cube);
            item.name = "Coin_" + id; item.transform.SetParent(root, false);
            item.transform.position = new Vector3(x, y, 0f);
            item.transform.localScale = Vector3.one * .5f;
            UnityEngine.Object.DestroyImmediate(item.GetComponent<Collider>());
            item.GetComponent<MeshRenderer>().enabled = false;
            var collect = item.AddComponent<Collectible>(); collect.collectibleId = id; items.Add(collect);
            var coin = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            coin.name = "CoinVisual_" + id; coin.transform.SetParent(item.transform, false);
            coin.transform.localPosition = Vector3.zero;
            coin.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            coin.transform.localScale = new Vector3(1.2f, .12f, 1.2f);
            UnityEngine.Object.DestroyImmediate(coin.GetComponent<Collider>());
            coin.GetComponent<MeshRenderer>().sharedMaterial = gold;
            coin.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        internal static GameObject Visual(GameObject prefab, Transform parent, string id, Material material,
            Bounds target, Quaternion? orientation = null)
        {
            var visual = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            visual.name = id; visual.transform.SetParent(parent, true);
            if (orientation.HasValue) visual.transform.rotation = orientation.Value;
            foreach (var renderer in visual.GetComponentsInChildren<Renderer>(true))
            {
                var materials = renderer.sharedMaterials;
                for (var i = 0; i < materials.Length; i++) materials[i] = material;
                renderer.sharedMaterials = materials;
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            foreach (var collider in visual.GetComponentsInChildren<Collider>(true)) collider.enabled = false;
            foreach (var body in visual.GetComponentsInChildren<Rigidbody>(true)) body.isKinematic = true;
            var bounds = RendererBounds(visual);
            if (bounds.size.x <= 0 || bounds.size.y <= 0 || bounds.size.z <= 0)
                throw new InvalidOperationException("Prefab sin dimensiones válidas: " + id);
            visual.transform.localScale = new Vector3(target.size.x / bounds.size.x,
                target.size.y / bounds.size.y, target.size.z / bounds.size.z);
            visual.transform.position += target.center - RendererBounds(visual).center;
            return visual;
        }

        private static Bounds RendererBounds(GameObject visual)
        {
            var renderers = visual.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) throw new InvalidOperationException("Prefab sin renderers: " + visual.name);
            var bounds = renderers[0].bounds;
            for (var i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            return bounds;
        }

        internal static void Box(Transform root, string id, Vector3 position, Vector3 scale, Material material)
        {
            var visual = GameObject.CreatePrimitive(PrimitiveType.Cube);
            visual.name = id; visual.transform.SetParent(root, false);
            visual.transform.position = position; visual.transform.localScale = scale;
            UnityEngine.Object.DestroyImmediate(visual.GetComponent<Collider>());
            visual.GetComponent<MeshRenderer>().sharedMaterial = material;
            visual.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        internal static void Sphere(Transform root, string id, Vector3 position, Vector3 scale, Material material)
        {
            var visual = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            visual.name = id; visual.transform.SetParent(root, false);
            visual.transform.position = position; visual.transform.localScale = scale;
            UnityEngine.Object.DestroyImmediate(visual.GetComponent<Collider>());
            visual.GetComponent<MeshRenderer>().sharedMaterial = material;
            visual.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }
    }
}
