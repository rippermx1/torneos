using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Orbit.AlienRun.Editor
{
    public static class LevelDesignBuilder
    {
        public const string ScenePath = KayKitPilotBuilder.LocalRoot + "/AlienRunLevelDesign.unity";

        [MenuItem("Orbit/Alien Run/Create Local Level Design")]
        public static void CreateLevelDesign()
        {
            if (File.Exists(ScenePath))
                throw new InvalidOperationException("La variante de nivel ya existe; se conserva sin sobrescribirla.");
            if (!File.Exists(LevelOneBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero el nivel local.", LevelOneBuilder.ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            var scene = EditorSceneManager.OpenScene(LevelOneBuilder.ScenePath, OpenSceneMode.Single);
            if (GameObject.Find("LevelDesign") != null)
                throw new InvalidOperationException("La escena de origen ya tiene esta composición.");
            var camera = Camera.main;
            var follow = camera != null ? camera.GetComponent<FollowCamera>() : null;
            if (follow == null) throw new InvalidOperationException("Falta la cámara de seguimiento.");
            follow.lookAhead = 3.2f;
            follow.minFocusX = 2f;
            follow.maxFocusX = 84f;
            follow.verticalFollow = .28f;
            follow.maxVerticalLift = .8f;
            camera.backgroundColor = new Color(.43f, .68f, .75f);

            var root = new GameObject("LevelDesign");
            var distant = NewMaterial("LevelDesignDistant", new Color(.42f, .66f, .67f));
            var middle = NewMaterial("LevelDesignMid", new Color(.25f, .51f, .54f));
            var rim = NewMaterial("LevelDesignFloorRim", new Color(.22f, .66f, .65f));
            var caution = NewMaterial("LevelDesignGapAmber", new Color(1f, .68f, .20f));
            var landing = NewMaterial("LevelDesignLanding", new Color(.53f, .80f, .44f));

            var oldBlocks = GameObject.Find("KayKitPolish")?.transform;
            if (oldBlocks == null) throw new InvalidOperationException("Falta el fondo anterior.");
            for (var i = 0; i < 12; i++)
            {
                var block = oldBlocks.Find("Distant_Block_" + i);
                if (block == null) throw new InvalidOperationException("Falta bloque de fondo: " + i);
                block.gameObject.SetActive(false);
            }

            // Siluetas redondeadas en dos planos: profundidad sin tapar monedas, bordes o jugador.
            for (var i = 0; i < 12; i++)
            {
                var x = -9f + i * 9f;
                DecorativeSphere(root.transform, "FarHill_" + i,
                    new Vector3(x, -4.35f + (i % 3) * .18f, 18f),
                    new Vector3(12f, 3.2f + (i % 3) * .35f, 1.1f), distant);
            }
            for (var i = 0; i < 10; i++)
            {
                var x = -8f + i * 11f;
                DecorativeSphere(root.transform, "NearHill_" + i,
                    new Vector3(x, -4.6f + (i % 2) * .2f, 11f),
                    new Vector3(13f, 3.4f + (i % 3) * .3f, 1.2f), middle);
            }

            // La línea superior da continuidad al piso; ámbar avisa de la salida y verde de la recepción.
            foreach (var section in new[] { new[] { -5f, 21f }, new[] { 25f, 51f }, new[] { 56f, 88f } })
                DecorativeBox(root.transform, "FloorRim_" + section[0],
                    new Vector3((section[0] + section[1]) * .5f, .035f, -1.46f),
                    new Vector3(section[1] - section[0], .08f, .16f), rim);
            foreach (var x in new[] { 20.55f, 50.55f })
                DecorativeBox(root.transform, "GapTakeoff_" + x,
                    new Vector3(x, .045f, -.12f), new Vector3(.65f, .09f, 2.7f), caution);
            foreach (var x in new[] { 25.6f, 56.6f })
                DecorativeBox(root.transform, "GapLanding_" + x,
                    new Vector3(x, .045f, -.12f), new Vector3(.85f, .09f, 2.7f), landing);
            foreach (var x in new[] { 29f, 37f, 44f })
                DecorativeBox(root.transform, "UpperRouteMarker_" + x,
                    new Vector3(x, x == 37f ? 3.85f : x == 29f ? 2.75f : 2.9f, -1.46f),
                    new Vector3(x == 44f ? 3.6f : 4.6f, .08f, .14f), rim);

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new InvalidOperationException("No se pudo guardar la variante de nivel.");
            AssetDatabase.SaveAssets();
            Debug.Log("Level design scene saved: " + ScenePath);
        }

        [MenuItem("Orbit/Alien Run/Refine Local Level Background")]
        public static void RefineBackground()
        {
            if (!File.Exists(ScenePath)) throw new FileNotFoundException("Falta la variante local.", ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            var root = GameObject.Find("LevelDesign")?.transform;
            if (root == null) throw new InvalidOperationException("Falta LevelDesign.");
            for (var i = 0; i < 12; i++)
            {
                var hill = root.Find("FarHill_" + i);
                if (hill == null || Mathf.Abs(hill.position.y - (-2.35f + (i % 3) * .28f)) > .001f)
                    throw new InvalidOperationException("El fondo ya cambió: FarHill_" + i);
                hill.position = new Vector3(hill.position.x, -4.35f + (i % 3) * .18f, hill.position.z);
                hill.localScale = new Vector3(12f, 3.2f + (i % 3) * .35f, 1.1f);
            }
            for (var i = 0; i < 10; i++)
            {
                var hill = root.Find("NearHill_" + i);
                if (hill == null || Mathf.Abs(hill.position.y - (-3.15f + (i % 2) * .2f)) > .001f)
                    throw new InvalidOperationException("El fondo ya cambió: NearHill_" + i);
                hill.position = new Vector3(hill.position.x, -4.6f + (i % 2) * .2f, hill.position.z);
                hill.localScale = new Vector3(13f, 3.4f + (i % 3) * .3f, 1.2f);
            }
            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene)) throw new InvalidOperationException("No se pudo guardar el fondo.");
            Debug.Log("Level design background refined: " + ScenePath);
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

        private static void DecorativeSphere(Transform parent, string name, Vector3 position, Vector3 scale, Material material)
            => Decorative(PrimitiveType.Sphere, parent, name, position, scale, material);

        private static void DecorativeBox(Transform parent, string name, Vector3 position, Vector3 scale, Material material)
            => Decorative(PrimitiveType.Cube, parent, name, position, scale, material);

        private static void Decorative(PrimitiveType shape, Transform parent, string name,
            Vector3 position, Vector3 scale, Material material)
        {
            var visual = GameObject.CreatePrimitive(shape);
            visual.name = name;
            visual.transform.SetParent(parent, true);
            visual.transform.position = position;
            visual.transform.localScale = scale;
            UnityEngine.Object.DestroyImmediate(visual.GetComponent<Collider>());
            var renderer = visual.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }
    }
}
