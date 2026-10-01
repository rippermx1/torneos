using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Orbit.AlienRun.Editor
{
    // An original scenic layer and a final challenge built over the preserved V6 level.
    public static class ProductLevelV7Builder
    {
        public const string ScenePath = KayKitPilotBuilder.LocalRoot + "/AlienRunProductLevelV7.unity";
        private const string SkyPath = "Assets/Orbit/AlienRun/OriginalArt/alien-run-sky-v1.png";

        [MenuItem("Orbit/Alien Run/Create Local Product Level V7")]
        public static void CreateLevel()
        {
            if (File.Exists(ScenePath)) throw new InvalidOperationException("El nivel V7 ya existe.");
            if (!File.Exists(ProductLevelBuilder.ScenePath)) throw new FileNotFoundException("Falta V6.");
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var sky = AssetDatabase.LoadAssetAtPath<Texture2D>(SkyPath);
            if (sky == null) throw new FileNotFoundException("Falta la textura original del cielo.", SkyPath);

            var wood = ProductLevelBuilder.LoadMaterial("PlatformerURP");
            var gold = ProductLevelBuilder.LoadMaterial("LevelOneGold");
            var rim = ProductLevelBuilder.LoadMaterial("LevelDesignFloorRim");
            var amber = ProductLevelBuilder.LoadMaterial("LevelDesignGapAmber");
            var landing = ProductLevelBuilder.LoadMaterial("LevelDesignLanding");
            var far = ProductLevelBuilder.LoadMaterial("LevelDesignDistant");
            var near = ProductLevelBuilder.LoadMaterial("LevelDesignMid");
            var floor = ProductLevelBuilder.LoadPrefab("neutral/floor_wood_4x4");
            var pillar = ProductLevelBuilder.LoadPrefab("neutral/pillar_1x1x2");
            var spikes = ProductLevelBuilder.LoadPrefab("neutral/floor_spikes_2x2x1");
            var roller = ProductLevelBuilder.LoadPrefab("neutral/spikeroller_horizontal");
            var ball = ProductLevelBuilder.LoadPrefab("neutral/spikeball");
            var spring = ProductLevelBuilder.LoadPrefab("neutral/spring");
            var finishSign = ProductLevelBuilder.LoadPrefab("neutral/signage_finish_wide");
            var direction = ProductLevelBuilder.LoadPrefab("neutral/signage_arrows_right");
            var arch = ProductLevelBuilder.LoadPrefab("blue/arch_wide_blue");
            var scene = EditorSceneManager.OpenScene(ProductLevelBuilder.ScenePath, OpenSceneMode.Single);
            var session = UnityEngine.Object.FindFirstObjectByType<RunSession>();
            if (session == null || session.collectibles.Length != 14 || GameObject.Find("ProductLevelV7") != null)
                throw new InvalidOperationException("V6 no coincide con el nivel esperado.");
            var root = new GameObject("ProductLevelV7").transform;

            // Scenic tiles are behind the KayKit hills, with no physical collision.
            var shader = Shader.Find("Universal Render Pipeline/Unlit");
            if (shader == null) throw new InvalidOperationException("Falta URP Unlit.");
            var skyMaterialPath = KayKitPilotBuilder.LocalRoot + "/AlienRunSkyV1.mat";
            var skyMaterial = AssetDatabase.LoadAssetAtPath<Material>(skyMaterialPath);
            if (skyMaterial == null)
            {
                skyMaterial = new Material(shader) { name = "AlienRunSkyV1" };
                skyMaterial.SetTexture("_BaseMap", sky);
                skyMaterial.SetColor("_BaseColor", Color.white);
                AssetDatabase.CreateAsset(skyMaterial, skyMaterialPath);
            }
            skyMaterial.SetTexture("_BaseMap", sky);
            skyMaterial.SetColor("_BaseColor", Color.white);
            skyMaterial.SetFloat("_Cull", 0f);
            EditorUtility.SetDirty(skyMaterial);
            for (var i = 0; i < 7; i++)
            {
                var panel = GameObject.CreatePrimitive(PrimitiveType.Quad);
                panel.name = "OriginalSky_" + i;
                panel.transform.SetParent(root, false);
                panel.transform.position = new Vector3(16f + i * 56f, -2f, 24f);
                panel.transform.rotation = Quaternion.identity;
                panel.transform.localScale = new Vector3(56.1f, 18f, 1f);
                UnityEngine.Object.DestroyImmediate(panel.GetComponent<Collider>());
                panel.GetComponent<MeshRenderer>().sharedMaterial = skyMaterial;
                panel.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }

            // Two more ground beats: optional spring route, then two moving ground threats.
            ProductLevelBuilder.Ground(root, "Ground_H_Spring", 286f, 326f, floor, wood);
            ProductLevelBuilder.Ground(root, "Ground_I_Gauntlet", 330f, 370f, floor, wood);
            ProductLevelBuilder.Platform(root, "Upper_H_01", 295f, 301f, 2.7f, floor, pillar, wood);
            ProductLevelBuilder.Platform(root, "Upper_H_02", 304f, 310f, 3.55f, floor, pillar, wood);
            ProductLevelBuilder.Platform(root, "Upper_I_01", 335f, 341f, 2.7f, floor, pillar, wood);
            ProductLevelBuilder.Platform(root, "Upper_I_02", 343f, 349f, 3.55f, floor, pillar, wood);
            ProductLevelBuilder.Spike(root, "Hazard_Gauntlet", 360f, spikes, wood);
            Patrol(root, session, roller, wood, "PatrolRoller_H", 316f, 319f, 1.05f, 1.5f, .8f,
                new Vector3(1.45f, 1.25f, .7f));
            Patrol(root, session, ball, wood, "PatrolBall_I", 354f, 356f, 1.15f, 1.3f, .8f,
                new Vector3(1.3f, 1.3f, 1.3f));
            Patrol(root, session, ball, wood, "PatrolBall_Upper", 306f, 309f, 4.75f, 1.2f, .7f,
                new Vector3(1.1f, 1.1f, 1.1f));

            var pad = new GameObject("BouncePad_H");
            pad.transform.SetParent(root, false);
            pad.transform.position = new Vector3(298.5f, 2.9f, 0f);
            var bounce = pad.AddComponent<BouncePad>();
            bounce.session = session;
            ProductLevelBuilder.Visual(spring, pad.transform, "KayKit_BouncePad_H", wood,
                new Bounds(pad.transform.position, new Vector3(1.3f, .45f, 1.3f)));

            var items = new List<Collectible>(session.collectibles);
            ProductLevelBuilder.Coin(root, items, "c15", 96f, 1.3f, gold);
            ProductLevelBuilder.Coin(root, items, "c16", 143f, 3.5f, gold);
            ProductLevelBuilder.Coin(root, items, "c17", 188f, 1.3f, gold);
            ProductLevelBuilder.Coin(root, items, "c18", 241f, 1.3f, gold);
            ProductLevelBuilder.Coin(root, items, "c19", 260f, 4.35f, gold);
            ProductLevelBuilder.Coin(root, items, "c20", 275f, 1.3f, gold);
            ProductLevelBuilder.Coin(root, items, "c21", 291f, 1.3f, gold);
            ProductLevelBuilder.Coin(root, items, "c22", 308f, 4.35f, gold);
            ProductLevelBuilder.Coin(root, items, "c23", 333f, 1.3f, gold);
            ProductLevelBuilder.Coin(root, items, "c24", 365f, 1.3f, gold);
            session.collectibles = items.ToArray();
            session.requiredCollectibles = 12;
            session.laterCheckpoints = new[] { new Vector3(136f, 2f, 0f),
                new Vector3(231f, 2f, 0f), new Vector3(332f, 2f, 0f) };
            session.laterGuidedJumps = new[] { 101f, 124f, 157f, 172f, 190f, 220f,
                235f, 245f, 267f, 314.5f, 324f, 350f, 357f };

            foreach (var section in new[] { new Vector2(286f, 326f), new Vector2(330f, 370f) })
                ProductLevelBuilder.Box(root, "FloorRim_" + section.x,
                    new Vector3((section.x + section.y) * .5f, .035f, -1.46f),
                    new Vector3(section.y - section.x, .08f, .16f), rim);
            ProductLevelBuilder.Box(root, "GapTakeoff_325", new Vector3(325.5f, .045f, -.12f),
                new Vector3(.7f, .09f, 2.7f), amber);
            ProductLevelBuilder.Box(root, "GapLanding_330", new Vector3(330.7f, .045f, -.12f),
                new Vector3(.85f, .09f, 2.7f), landing);
            foreach (var x in new[] { 313f, 349f, 357f })
                for (var i = 0; i < 3; i++)
                    ProductLevelBuilder.Box(root, "DangerWarning_" + x + "_" + i,
                        new Vector3(x + i * .45f, .045f, -.13f), new Vector3(.17f, .09f, 2.65f), amber);

            // Landmarks and signs sit behind the playing plane and do not obstruct jumps.
            ProductLevelBuilder.Visual(arch, root, "KayKit_SpringGate", wood,
                new Bounds(new Vector3(290f, 1.8f, 2.8f), new Vector3(3.5f, 3.6f, .7f)));
            ProductLevelBuilder.Visual(arch, root, "KayKit_LastCheckpoint", wood,
                new Bounds(new Vector3(332f, 1.8f, 2.8f), new Vector3(3.5f, 3.6f, .7f)));
            ProductLevelBuilder.Visual(finishSign, root, "KayKit_FinalSign", wood,
                new Bounds(new Vector3(366f, 3.25f, 2.8f), new Vector3(4.2f, 1.1f, .5f)));
            foreach (var x in new[] { 88f, 174f, 286f, 330f })
                ProductLevelBuilder.Visual(direction, root, "KayKit_Direction_" + x, wood,
                    new Bounds(new Vector3(x + 2f, 2.5f, 2.5f), new Vector3(1.8f, .85f, .5f)));
            var oldX = session.finish.position.x;
            session.finish.position += Vector3.right * (366f - oldX);
            var finishVisual = GameObject.Find("KayKit_Finish");
            if (finishVisual == null) throw new InvalidOperationException("Falta el visual de meta.");
            finishVisual.transform.position += Vector3.right * (366f - oldX);
            Camera.main.GetComponent<FollowCamera>().maxFocusX = 364f;
            var ridge = GameObject.Find("Back_Ridge");
            ridge.transform.position = new Vector3(185f, ridge.transform.position.y, ridge.transform.position.z);
            ridge.transform.localScale = new Vector3(390f, ridge.transform.localScale.y, ridge.transform.localScale.z);
            for (var i = 34; i < 44; i++)
                ProductLevelBuilder.Sphere(root, "FarHill_" + i,
                    new Vector3(-9f + i * 9f, -4.35f + (i % 3) * .18f, 18f),
                    new Vector3(12f, 3.2f + (i % 3) * .35f, 1.1f), far);
            for (var i = 28; i < 35; i++)
                ProductLevelBuilder.Sphere(root, "NearHill_" + i,
                    new Vector3(-8f + i * 11f, -4.6f + (i % 2) * .2f, 11f),
                    new Vector3(13f, 3.4f + (i % 3) * .3f, 1.2f), near);

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new InvalidOperationException("No se pudo guardar V7.");
            AssetDatabase.SaveAssets();
            Debug.Log("Product level V7 saved: " + ScenePath);
        }

        // Repair the first generated local V7 scene without discarding its GUID or other edits.
        public static void RepairSky()
        {
            var scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            var material = AssetDatabase.LoadAssetAtPath<Material>(
                KayKitPilotBuilder.LocalRoot + "/AlienRunSkyV1.mat");
            if (material == null) throw new FileNotFoundException("Falta AlienRunSkyV1.mat.");
            material.SetFloat("_Cull", 0f);
            for (var i = 0; i < 7; i++)
            {
                var panel = GameObject.Find("OriginalSky_" + i);
                if (panel == null) throw new InvalidOperationException("Falta panel del cielo " + i);
                panel.transform.rotation = Quaternion.identity;
            }
            EditorUtility.SetDirty(material);
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            Debug.Log("Product level V7 sky repaired.");
        }

        private static void Patrol(Transform root, RunSession session, GameObject prefab, Material material,
            string name, float left, float right, float y, float speed, float radius, Vector3 size)
        {
            var enemy = new GameObject(name);
            enemy.transform.SetParent(root, false);
            enemy.transform.position = new Vector3(left, y, 0f);
            var patrol = enemy.AddComponent<PatrolEnemy>();
            patrol.session = session; patrol.leftX = left; patrol.rightX = right;
            patrol.speed = speed; patrol.hitRadius = radius;
            var visual = ProductLevelBuilder.Visual(prefab, enemy.transform, "KayKit_" + name, material,
                new Bounds(enemy.transform.position, size));
            if (name.Contains("Roller")) visual.AddComponent<VisualSpinner>().degreesPerSecond = 180f;
        }
    }
}
