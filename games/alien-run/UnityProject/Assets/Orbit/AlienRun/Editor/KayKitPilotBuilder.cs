using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Orbit.AlienRun.Editor
{
    public static class KayKitPilotBuilder
    {
        public const string LocalRoot = "Assets/Orbit/AlienRun/LocalArt";
        public const string ScenePath = LocalRoot + "/AlienRunEngineerPilot.unity";
        private const string MaterialPath = LocalRoot + "/EngineerURP.mat";
        private const string ControllerPath = LocalRoot + "/EngineerIdle.controller";
        private const string FallHoldPath = LocalRoot + "/EngineerFallHold.anim";
        private const string PrefabPath = "Assets/KayKit/Characters/KayKit - Adventurers (for Unity)/Prefabs/Characters/Engineer.prefab";
        private const string SourceMaterialPath = "Assets/KayKit/Characters/KayKit - Adventurers (for Unity)/Materials/engineer.mat";
        private const string IdlePath = "Assets/KayKit/Characters/Animations/Animations/Rig_Medium/General/Idle_A.anim";

        [MenuItem("Orbit/Alien Run/Create Local Engineer Pilot")]
        public static void CreatePilot()
        {
            if (File.Exists(ScenePath))
                throw new InvalidOperationException("La variante local ya existe; se conserva sin sobrescribirla.");
            if (!File.Exists(GreyboxBuilder.ScenePath))
                throw new FileNotFoundException("Falta la escena greybox de origen.", GreyboxBuilder.ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            var sourceMaterial = AssetDatabase.LoadAssetAtPath<Material>(SourceMaterialPath);
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (prefab == null || sourceMaterial == null || shader == null || sourceMaterial.mainTexture == null)
                throw new InvalidOperationException("Engineer, su textura o el shader URP Lit no están disponibles.");
            ValidateRig(prefab);

            Directory.CreateDirectory(LocalRoot);
            AssetDatabase.Refresh();
            var material = new Material(shader) { name = "EngineerURP" };
            material.SetColor("_BaseColor", Color.white);
            material.SetTexture("_BaseMap", sourceMaterial.mainTexture);
            AssetDatabase.CreateAsset(material, MaterialPath);
            var animationController = CreateAnimationController();

            var scene = EditorSceneManager.OpenScene(GreyboxBuilder.ScenePath, OpenSceneMode.Single);
            var runner = GameObject.Find("Runner");
            var controller = runner != null ? runner.GetComponent<CharacterController>() : null;
            var skin = runner != null ? runner.GetComponentInChildren<VisualSkin>() : null;
            if (controller == null || skin == null || skin.fallbackVisual == null || skin.visualPrefab != null)
                throw new InvalidOperationException("La escena base no conserva Runner, collider y fallback esperados.");

            var sample = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            var renderers = sample.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0)
                throw new InvalidOperationException("Engineer no contiene renderers visibles.");
            var bounds = renderers[0].bounds;
            for (var i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            UnityEngine.Object.DestroyImmediate(sample);
            if (bounds.size.y <= 0.01f)
                throw new InvalidOperationException("La altura del prefab Engineer no es válida.");

            var scale = Mathf.Clamp(1.7f / bounds.size.y, 0.05f, 10f);
            skin.visualPrefab = prefab;
            skin.materialOverride = material;
            skin.animationController = animationController;
            skin.visualScale = Vector3.one * scale;
            skin.visualOffset = -bounds.center * scale;
            skin.visualEuler = Vector3.zero;
            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
                throw new InvalidOperationException("No se pudo guardar la variante local del nivel.");
            AssetDatabase.SaveAssets();
            Debug.Log($"Engineer pilot saved: {ScenePath}; source height {bounds.size.y:0.###}m, " +
                $"visual scale {scale:0.###}, gameplay collider {controller.height:0.###}m x {controller.radius:0.###}m.");
        }

        [MenuItem("Orbit/Alien Run/Upgrade Local Engineer Animations")]
        public static void UpgradeExistingPilotAnimations()
        {
            if (!File.Exists(ScenePath)) throw new FileNotFoundException("Falta la variante Engineer local.", ScenePath);
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            ValidateRig(prefab);
            var animationController = CreateAnimationController();
            var scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            var runner = GameObject.Find("Runner");
            var skin = runner != null ? runner.GetComponentInChildren<VisualSkin>() : null;
            if (skin == null || skin.visualPrefab != prefab)
                throw new InvalidOperationException("La variante local no contiene el Engineer esperado.");
            skin.animationController = animationController;
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
        }

        private static void ValidateRig(GameObject prefab)
        {
            var animator = prefab != null ? prefab.GetComponentInChildren<Animator>(true) : null;
            if (animator == null || animator.avatar == null || !animator.avatar.isValid || !animator.avatar.isHuman)
                throw new InvalidOperationException("Engineer no tiene un Avatar humano válido para sus clips.");
        }

        private static AnimatorController CreateAnimationController()
        {
            const string movement = "Assets/KayKit/Characters/Animations/Animations/Rig_Medium/Movement Basic/";
            var clips = new[] {
                AssetDatabase.LoadAssetAtPath<AnimationClip>(IdlePath),
                AssetDatabase.LoadAssetAtPath<AnimationClip>(movement + "Running_A.anim"),
                AssetDatabase.LoadAssetAtPath<AnimationClip>(movement + "Jump_Start.anim"),
                AssetDatabase.LoadAssetAtPath<AnimationClip>(movement + "Jump_Idle.anim"),
                AssetDatabase.LoadAssetAtPath<AnimationClip>(movement + "Jump_Land.anim"),
                AssetDatabase.LoadAssetAtPath<AnimationClip>("Assets/KayKit/Characters/Animations/Animations/Rig_Medium/Simulation/Cheering.anim")
            };
            foreach (var clip in clips)
                if (clip == null) throw new InvalidOperationException("Falta un clip de movimiento del rig mediano KayKit.");
            clips[3] = CreateFallHoldClip(clips[3]);
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(ControllerPath);
            if (controller == null) controller = AnimatorController.CreateAnimatorControllerAtPath(ControllerPath);
            var machine = controller.layers[0].stateMachine;
            foreach (var child in machine.states) machine.RemoveState(child.state);
            var names = new[] { "Idle", "Run", "Jump", "Fall", "Land", "Finish" };
            for (var i = 0; i < names.Length; i++) machine.AddState(names[i]).motion = clips[i];
            machine.defaultState = machine.states[0].state;
            EditorUtility.SetDirty(controller);
            return controller;
        }

        private static AnimationClip CreateFallHoldClip(AnimationClip source)
        {
            var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(FallHoldPath);
            if (clip == null)
            {
                clip = UnityEngine.Object.Instantiate(source);
                clip.name = "EngineerFallHold";
                clip.hideFlags = HideFlags.None;
                AssetDatabase.CreateAsset(clip, FallHoldPath);
            }
            var serialized = new SerializedObject(clip);
            var loop = serialized.FindProperty("m_AnimationClipSettings.m_LoopTime");
            if (loop == null) throw new InvalidOperationException("No se pudo desactivar el bucle de la copia local de Jump_Idle.");
            loop.boolValue = false;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(clip);
            return clip;
        }
    }
}
