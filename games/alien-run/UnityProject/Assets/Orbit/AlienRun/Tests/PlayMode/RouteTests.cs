using System.Collections;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
#if UNITY_EDITOR
using UnityEditor.SceneManagement;
#endif

namespace Orbit.AlienRun.Tests
{
    public sealed class RouteTests
    {
        private Touchscreen addedTouchscreen;

        [TearDown]
        public void RemoveTestTouchscreen()
        {
            if (addedTouchscreen != null) InputSystem.RemoveDevice(addedTouchscreen);
            addedTouchscreen = null;
        }

        [UnityTest]
        public IEnumerator GroundRouteCanFinishTwice()
        {
            SceneManager.LoadScene("AlienRunGreybox");
            yield return null;

            var session = Object.FindFirstObjectByType<RunSession>();
            Assert.IsNotNull(session);
            Assert.IsNotNull(session.bridge);
            Assert.IsNotNull(session.runner);

            yield return CompleteRouteTwice(session);
        }

        [UnityTest]
        public IEnumerator CheckpointRespawnAndNewPracticeReset()
        {
            SceneManager.LoadScene("AlienRunGreybox");
            yield return null;

            var session = Object.FindFirstObjectByType<RunSession>();
            session.bridge.StartLocalPractice();
            Assert.IsFalse(session.CheckpointReached);
            Assert.AreEqual(0, session.Deaths);
            session.Respawn();
            Assert.AreEqual(1, session.Deaths);
            Assert.AreEqual(session.spawn.x, session.runner.transform.position.x, 0.01f);

            session.AbortRun();
            session.bridge.StartLocalPractice();
            Assert.AreEqual(0, session.Deaths);
            session.runner.ResetAt(session.checkpoint + Vector3.right);
            yield return null;
            Assert.IsTrue(session.CheckpointReached);
            session.Respawn();
            Assert.AreEqual(1, session.Deaths);
            Assert.AreEqual(session.checkpoint.x, session.runner.transform.position.x, 0.01f);

            session.AbortRun();
            session.bridge.StartLocalPractice();
            Assert.IsFalse(session.CheckpointReached);
            Assert.AreEqual(0, session.Deaths);
            Assert.AreEqual(session.spawn.x, session.runner.transform.position.x, 0.01f);
            session.AbortRun();
        }

        [UnityTest]
        public IEnumerator TouchControlsAllowMoveAndJumpTogetherAndClearOnBlur()
        {
            SceneManager.LoadScene("AlienRunGreybox");
            yield return null;
            if (Touchscreen.current == null) addedTouchscreen = InputSystem.AddDevice<Touchscreen>();
            yield return null;

            var session = Object.FindFirstObjectByType<RunSession>();
            var controls = session.GetComponent<MobileControls>();
            Assert.IsNotNull(controls);
            Assert.IsTrue(controls.ControlsVisible);
            var buttons = controls.GetComponentsInChildren<TouchHoldButton>();
            Assert.AreEqual(3, buttons.Length);
            TouchHoldButton left = null, jump = null;
            foreach (var button in buttons)
            {
                Assert.GreaterOrEqual(button.GetComponent<RectTransform>().rect.width, 100f);
                if (button.name == "MoveLeft") left = button;
                if (button.name == "Jump") jump = button;
            }
            Assert.IsNotNull(left);
            Assert.IsNotNull(jump);

            session.bridge.StartLocalPractice();
            ExecuteEvents.Execute(left.gameObject, new PointerEventData(EventSystem.current) { pointerId = 7 },
                ExecuteEvents.pointerDownHandler);
            ExecuteEvents.Execute(jump.gameObject, new PointerEventData(EventSystem.current) { pointerId = 8 },
                ExecuteEvents.pointerDownHandler);
            yield return null;
            Assert.AreEqual(-1f, session.runner.TouchAxis);
            Assert.IsTrue(session.runner.TouchJumpHeld);

            controls.ClearInput();
            Assert.AreEqual(0f, session.runner.TouchAxis);
            Assert.IsFalse(session.runner.TouchJumpHeld);
            Assert.IsFalse(left.IsPressed);
            Assert.IsFalse(jump.IsPressed);
            session.AbortRun();
        }

        [UnityTest]
        public IEnumerator HudShowsLiveRunStateWithoutBlockingTouchTargets()
        {
            SceneManager.LoadScene("AlienRunGreybox");
            yield return null;

            var session = Object.FindFirstObjectByType<RunSession>();
            var hud = session.GetComponent<RunHud>();
            Assert.IsNotNull(hud);
            var labels = hud.GetComponentsInChildren<UnityEngine.UI.Text>();
            Assert.AreEqual(5, labels.Length);
            foreach (var label in labels) Assert.IsFalse(label.raycastTarget);
            foreach (var image in hud.GetComponentsInChildren<UnityEngine.UI.Image>())
                Assert.IsFalse(image.raycastTarget);

            session.bridge.StartLocalPractice();
            yield return null;
            Assert.IsTrue(System.Array.Exists(labels, label => label.text.StartsWith("TIEMPO ")));
            Assert.IsTrue(System.Array.Exists(labels, label => label.text == "CRISTALES 0/6"));
            Assert.IsTrue(System.Array.Exists(labels, label => label.text == "CAÍDAS 0"));
            session.runner.ResetAt(session.checkpoint + Vector3.right);
            yield return null;
            Assert.IsTrue(session.CheckpointReached);
            yield return null;
            Assert.IsTrue(System.Array.Exists(labels, label => label.text == "CHECKPOINT · activo"));
            session.Respawn();
            yield return null;
            yield return null;
            Assert.IsTrue(System.Array.Exists(labels, label => label.text == "CAÍDAS 1"));
            session.AbortRun();
        }

        [UnityTest]
        public IEnumerator LocalEngineerPilotKeepsColliderAndFinishesTwice()
        {
#if UNITY_EDITOR
            const string pilot = "Assets/Orbit/AlienRun/LocalArt/AlienRunEngineerPilot.unity";
            if (!File.Exists(pilot)) { Assert.Ignore("KayKit local no está importado."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(pilot, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;

            var session = Object.FindFirstObjectByType<RunSession>();
            Assert.IsNotNull(session);
            var controller = session.runner.GetComponent<CharacterController>();
            Assert.AreEqual(1.8f, controller.height, 0.001f);
            Assert.AreEqual(0.36f, controller.radius, 0.001f);
            var skin = session.runner.GetComponentInChildren<VisualSkin>();
            Assert.IsNotNull(skin.visualPrefab);
            Assert.IsNotNull(skin.animationController);
            Assert.IsFalse(skin.fallbackVisual.activeSelf);
            Assert.AreEqual("Idle", skin.CurrentAnimationState);
            foreach (var collider in skin.GetComponentsInChildren<Collider>(true))
                Assert.IsFalse(collider.enabled, "El arte no debe agregar colisión de gameplay.");

            var seen = new HashSet<string>();
            yield return CompleteRouteTwice(session, skin, seen);
            CollectionAssert.IsSubsetOf(new[] { "Run", "Jump", "Fall", "Land", "Finish" }, seen);
#else
            Assert.Ignore("El piloto local se comprueba solo en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator LocalKayKitStageKeepsGameplayCollidersAndFinishesTwice()
        {
#if UNITY_EDITOR
            const string pilot = "Assets/Orbit/AlienRun/LocalArt/AlienRunKayKitStagePilot.unity";
            if (!File.Exists(pilot)) { Assert.Ignore("El escenario KayKit local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(pilot, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;

            var stage = GameObject.Find("KayKitStage");
            Assert.IsNotNull(stage);
            Assert.AreEqual(4, stage.transform.childCount);
            foreach (var name in new[] { "Upper_A", "Upper_B", "Upper_C" })
            {
                var platform = GameObject.Find(name);
                Assert.IsTrue(platform.GetComponent<BoxCollider>().enabled);
                Assert.IsFalse(platform.GetComponent<MeshRenderer>().enabled);
            }
            foreach (var collider in stage.GetComponentsInChildren<Collider>(true))
                Assert.IsFalse(collider.enabled, "La decoración no debe modificar colisiones de gameplay.");
            foreach (var renderer in stage.GetComponentsInChildren<Renderer>(true))
                Assert.AreEqual("Universal Render Pipeline/Lit", renderer.sharedMaterial.shader.name);
            var session = Object.FindFirstObjectByType<RunSession>();
            Assert.IsFalse(session.finish.GetComponent<MeshRenderer>().enabled);
            yield return CompleteRouteTwice(session);
#else
            Assert.Ignore("El escenario local se comprueba solo en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator LocalPolishedStageKeepsGameplayCollidersAndFinishesTwice()
        {
#if UNITY_EDITOR
            const string pilot = "Assets/Orbit/AlienRun/LocalArt/AlienRunKayKitPolished.unity";
            if (!File.Exists(pilot)) { Assert.Ignore("La variante pulida local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(pilot, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;

            var polish = GameObject.Find("KayKitPolish");
            Assert.IsNotNull(polish);
            foreach (var name in new[] { "Ground_A", "Ground_B", "Ground_C" })
            {
                var ground = GameObject.Find(name);
                Assert.IsTrue(ground.GetComponent<BoxCollider>().enabled);
                Assert.IsFalse(ground.GetComponent<MeshRenderer>().enabled);
            }
            foreach (var collider in polish.GetComponentsInChildren<Collider>(true))
                Assert.IsFalse(collider.enabled, "El pulido no debe agregar colisiones.");
            var session = Object.FindFirstObjectByType<RunSession>();
            yield return CompleteRouteTwice(session);
#else
            Assert.Ignore("La variante local se comprueba solo en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator LocalEnvironmentStageKeepsHazardsAndFinishesTwice()
        {
#if UNITY_EDITOR
            const string pilot = "Assets/Orbit/AlienRun/LocalArt/AlienRunKayKitEnvironment.unity";
            if (!File.Exists(pilot)) { Assert.Ignore("La variante de ambiente local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(pilot, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;

            var environment = GameObject.Find("KayKitEnvironment");
            Assert.IsNotNull(environment);
            foreach (var name in new[] { "Hazard_01", "Hazard_02" })
            {
                var hazard = GameObject.Find(name);
                Assert.IsTrue(hazard.GetComponent<BoxCollider>().enabled);
                Assert.IsNotNull(hazard.GetComponent<Hazard>());
                Assert.IsFalse(hazard.GetComponent<MeshRenderer>().enabled);
            }
            foreach (var collider in environment.GetComponentsInChildren<Collider>(true))
                Assert.IsFalse(collider.enabled, "El ambiente no debe agregar colisiones.");
            yield return CompleteRouteTwice(Object.FindFirstObjectByType<RunSession>());
#else
            Assert.Ignore("La variante local se comprueba solo en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator LevelOneRequiresCoinsAndDroneRespawnsPlayer()
        {
#if UNITY_EDITOR
            const string level = "Assets/Orbit/AlienRun/LocalArt/AlienRunLevelOne.unity";
            if (!File.Exists(level)) { Assert.Ignore("El primer nivel local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(level, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;
            var session = Object.FindFirstObjectByType<RunSession>();
            Assert.AreEqual(3, session.RequiredCollectibles);
            Assert.AreEqual("MONEDAS", session.collectibleLabel);
            var drone = Object.FindFirstObjectByType<PatrolEnemy>();
            Assert.IsNotNull(drone);
            Assert.AreEqual(35f, drone.leftX);
            Assert.AreEqual(39f, drone.rightX);
            foreach (var collectible in session.collectibles)
                Assert.IsFalse(collectible.GetComponent<MeshRenderer>().enabled);

            session.bridge.StartLocalPractice();
            session.runner.ResetAt(session.finish.position);
            yield return null;
            Assert.AreEqual(RunState.Playing, session.State, "La meta requiere monedas.");
            Assert.IsTrue(session.StatusMessage.Contains("Faltan 3"));
            session.runner.ResetAt(drone.transform.position);
            yield return null;
            Assert.AreEqual(1, session.Deaths, "El dron debe provocar respawn.");
            session.AbortRun();
            yield return CompleteRouteTwice(session);
#else
            Assert.Ignore("El nivel local se comprueba solo en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator LevelDesignReadsGapsWithoutChangingGameplayColliders()
        {
#if UNITY_EDITOR
            const string level = "Assets/Orbit/AlienRun/LocalArt/AlienRunLevelDesign.unity";
            if (!File.Exists(level)) { Assert.Ignore("La variante de diseño local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(level, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;
            var design = GameObject.Find("LevelDesign");
            Assert.IsNotNull(design);
            Assert.IsNotNull(design.transform.Find("GapTakeoff_20.55"));
            Assert.IsNotNull(design.transform.Find("GapLanding_25.6"));
            foreach (var collider in design.GetComponentsInChildren<Collider>(true))
                Assert.IsFalse(collider.enabled, "La señalización y el fondo no deben agregar colisiones.");
            var camera = Camera.main.GetComponent<FollowCamera>();
            Assert.Greater(camera.lookAhead, 3f);
            Assert.AreEqual(84f, camera.maxFocusX);
            var session = Object.FindFirstObjectByType<RunSession>();
            Assert.AreEqual(3, session.RequiredCollectibles);
            yield return CompleteRouteTwice(session);
#else
            Assert.Ignore("La variante local se comprueba solo en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator KayKitSectionMakesGroundHazardAndGroundRouteFinishesTwice()
        {
#if UNITY_EDITOR
            const string level = "Assets/Orbit/AlienRun/LocalArt/AlienRunKayKitSection.unity";
            if (!File.Exists(level)) { Assert.Ignore("La sección KayKit local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(level, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;
            var section = GameObject.Find("KayKitPlayableSection");
            Assert.IsNotNull(section);
            var spikes = section.transform.Find("Hazard_KayKitOpeningSpikes").GetComponent<BoxCollider>();
            Assert.IsTrue(spikes.enabled);
            Assert.IsNotNull(spikes.GetComponent<Hazard>());
            Assert.IsFalse(spikes.GetComponent<MeshRenderer>().enabled);
            foreach (var collider in section.GetComponentsInChildren<Collider>(true))
                if (collider != spikes) Assert.IsFalse(collider.enabled, "Las piezas visuales no agregan colisiones.");
            var session = Object.FindFirstObjectByType<RunSession>();
            Assert.AreEqual(3.5f, session.extraGuidedJumpX);
            Assert.AreEqual(3, session.RequiredCollectibles);
            session.bridge.StartLocalPractice();
            session.runner.ResetAt(new Vector3(4.5f, 1f, 0f));
            session.runner.GetComponent<CharacterController>().Move(Vector3.right * 2.5f);
            yield return null;
            Assert.AreEqual(1, session.Deaths,
                $"El bloque con pinchos debe provocar respawn; x={session.runner.transform.position.x:0.00}.");
            session.AbortRun();
            yield return CompleteRouteTwice(session, null, null, 3.5f);
#else
            Assert.Ignore("La sección local se comprueba solo en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator ProductLevelHasProgressionCheckpointsAndCompletableGroundRoute()
        {
#if UNITY_EDITOR
            const string level = "Assets/Orbit/AlienRun/LocalArt/AlienRunProductLevelV6.unity";
            if (!File.Exists(level)) { Assert.Ignore("El nivel KayKit local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(level, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;
            var stage = GameObject.Find("ProductLevel");
            var session = Object.FindFirstObjectByType<RunSession>();
            Assert.IsNotNull(stage);
            Assert.AreEqual(14, session.CollectibleCount);
            Assert.AreEqual(8, session.RequiredCollectibles);
            Assert.AreEqual(3, session.CheckpointCount);
            Assert.AreEqual(282f, session.finish.position.x);
            Assert.AreEqual(280f, Camera.main.GetComponent<FollowCamera>().maxFocusX);
            foreach (var name in new[] { "Ground_D_Approach", "Ground_E_Branch", "Ground_F_Moving",
                "Ground_G_Finale", "Upper_D_01", "Upper_G_02", "Hazard_Approach", "Hazard_Finale_02",
                "Barrier_FinalVault" })
                Assert.IsTrue(GameObject.Find(name).GetComponent<BoxCollider>().enabled, name);
            foreach (var collider in stage.GetComponentsInChildren<Collider>(true))
                if (collider.gameObject.name.StartsWith("KayKit_") || collider.gameObject.name.StartsWith("Gap") ||
                    collider.gameObject.name.StartsWith("DangerWarning") || collider.gameObject.name.StartsWith("FloorRim"))
                    Assert.IsFalse(collider.enabled, collider.gameObject.name);
            foreach (var name in new[] { "Upper_D_01", "Upper_E_02", "Upper_G_02",
                "Hazard_Approach", "Hazard_Finale_02", "Barrier_FinalVault" })
            {
                var gameplay = GameObject.Find(name).GetComponent<Collider>().bounds;
                var visualObject = GameObject.Find(name == "Barrier_FinalVault" ? "KayKit_FinalVault" : "KayKit_" + name);
                Assert.IsNotNull(visualObject, name);
                var renderers = visualObject.GetComponentsInChildren<Renderer>(true);
                Assert.IsNotEmpty(renderers, name);
                var visible = renderers[0].bounds;
                for (var i = 1; i < renderers.Length; i++) visible.Encapsulate(renderers[i].bounds);
                Assert.AreEqual(gameplay.center.x, visible.center.x, .1f, name + " visual x");
                Assert.AreEqual(gameplay.center.y, visible.center.y, .1f, name + " visual y");
                Assert.AreEqual(gameplay.size.x, visible.size.x, .1f, name + " visual width");
            }

            session.bridge.StartLocalPractice();
            session.runner.ResetAt(session.finish.position);
            yield return null;
            Assert.AreEqual(RunState.Playing, session.State, "La meta exige monedas.");
            session.AbortRun();
            session.bridge.StartLocalPractice();
            session.runner.ResetAt(new Vector3(137f, 2f, 0f));
            yield return null;
            Assert.AreEqual(2, session.ActiveCheckpoint);
            session.Respawn();
            Assert.AreEqual(136f, session.runner.transform.position.x, .01f);
            session.runner.ResetAt(new Vector3(232f, 2f, 0f));
            yield return null;
            Assert.AreEqual(3, session.ActiveCheckpoint);
            yield return new WaitForSeconds(.45f);
            session.Respawn();
            Assert.AreEqual(231f, session.runner.transform.position.x, .01f);
            session.AbortRun();
            yield return CompleteRouteTwice(session);
            Assert.GreaterOrEqual(session.CollectedCount, 8);
#else
            Assert.Ignore("El nivel local se comprueba solo en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator ProductLevelOptionalPlatformIsReachableWithNormalJump()
        {
#if UNITY_EDITOR
            const string level = "Assets/Orbit/AlienRun/LocalArt/AlienRunProductLevelV6.unity";
            if (!File.Exists(level)) { Assert.Ignore("El nivel KayKit local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(level, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;
            var session = Object.FindFirstObjectByType<RunSession>();
            session.bridge.StartLocalPractice();
            session.runner.ResetAt(new Vector3(106.2f, 1f, 0f));
            var settle = Time.realtimeSinceStartup + 1f;
            while (!session.runner.Grounded && Time.realtimeSinceStartup < settle) yield return null;
            Assert.IsTrue(session.runner.Grounded);
            session.runner.TouchAxis = 1f;
            session.runner.QueueTouchJump();
            var deadline = Time.realtimeSinceStartup + 3f;
            var reached = false;
            while (Time.realtimeSinceStartup < deadline)
            {
                var x = session.runner.transform.position.x;
                if (x >= 111.5f) session.runner.TouchAxis = 0f;
                if (session.runner.Grounded && x >= 109f && x <= 114f &&
                    session.runner.transform.position.y > 3.5f) { reached = true; break; }
                yield return null;
            }
            Assert.IsTrue(reached, $"No se pudo subir a la primera plataforma: " +
                $"x={session.runner.transform.position.x:0.00}, y={session.runner.transform.position.y:0.00}");
            session.runner.TouchAxis = 1f;
            while (session.runner.transform.position.x < 112.9f) yield return null;
            Assert.IsTrue(session.runner.Grounded, "El segundo salto debe salir desde la primera plataforma.");
            session.runner.QueueTouchJump();
            deadline = Time.realtimeSinceStartup + 3f;
            reached = false;
            while (Time.realtimeSinceStartup < deadline)
            {
                var x = session.runner.transform.position.x;
                if (x >= 119f) session.runner.TouchAxis = 0f;
                if (session.runner.Grounded && x >= 117f && x <= 122f &&
                    session.runner.transform.position.y > 4.35f) { reached = true; break; }
                yield return null;
            }
            Assert.IsTrue(reached, $"No se pudo subir a la segunda plataforma: " +
                $"x={session.runner.transform.position.x:0.00}, y={session.runner.transform.position.y:0.00}");
            Assert.GreaterOrEqual(session.CollectedCount, 1, "La ruta alta debe ofrecer su moneda.");
            session.AbortRun();
#else
            Assert.Ignore("El nivel local se comprueba solo en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest, Timeout(300000)]
        public IEnumerator ProductLevelV7HasActiveEnemiesSkyAndCompletableRoute()
        {
#if UNITY_EDITOR
            const string level = "Assets/Orbit/AlienRun/LocalArt/AlienRunProductLevelV7.unity";
            if (!File.Exists(level)) { Assert.Ignore("El nivel V7 local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(level, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;
            var session = Object.FindFirstObjectByType<RunSession>();
            Assert.AreEqual(24, session.CollectibleCount);
            Assert.AreEqual(12, session.RequiredCollectibles);
            Assert.AreEqual(4, session.CheckpointCount);
            Assert.AreEqual(366f, session.finish.position.x);
            Assert.IsNotNull(GameObject.Find("OriginalSky_0").GetComponent<MeshRenderer>().sharedMaterial.mainTexture);
            Assert.IsNotNull(GameObject.Find("BouncePad_H").GetComponent<BouncePad>());
            var patrol = GameObject.Find("PatrolRoller_H").GetComponent<PatrolEnemy>();
            Assert.IsNotNull(patrol);
            Assert.IsNotNull(GameObject.Find("PatrolBall_I").GetComponent<PatrolEnemy>());
            Assert.IsNotNull(GameObject.Find("PatrolBall_Upper").GetComponent<PatrolEnemy>());
            session.bridge.StartLocalPractice();
            var startX = patrol.transform.position.x;
            yield return new WaitForSeconds(.25f);
            Assert.Greater(patrol.transform.position.x, startX + .1f, "El enemigo debe moverse durante la partida.");
            session.runner.ResetAt(new Vector3(333f, 2f, 0f));
            yield return null;
            Assert.AreEqual(4, session.ActiveCheckpoint);
            session.Respawn();
            Assert.AreEqual(332f, session.runner.transform.position.x, .01f);
            session.AbortRun();
            yield return CompleteRouteTwice(session);
            Assert.GreaterOrEqual(session.CollectedCount, 12);
#else
            Assert.Ignore("El nivel local se comprueba solo en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator ProductLevelV7FinalGroundPassesUpperPlatforms()
        {
#if UNITY_EDITOR
            const string level = "Assets/Orbit/AlienRun/LocalArt/AlienRunProductLevelV7.unity";
            if (!File.Exists(level)) { Assert.Ignore("El nivel V7 local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(level, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;
            var session = Object.FindFirstObjectByType<RunSession>();
            session.bridge.StartLocalPractice();
            session.runner.ResetAt(new Vector3(332f, 1f, 0f));
            var deadline = Time.realtimeSinceStartup + 8f;
            while (session.runner.transform.position.x < 350f && Time.realtimeSinceStartup < deadline)
            {
                session.runner.TouchAxis = 1f;
                yield return null;
            }
            Assert.Greater(session.runner.transform.position.x, 350f,
                $"La ruta baja se bloquea en x={session.runner.transform.position.x:0.00}");
            session.AbortRun();
#else
            Assert.Ignore("Solo se prueba en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator ProductLevelV7FinalHazardsCanBeClearedFromCheckpoint()
        {
#if UNITY_EDITOR
            const string level = "Assets/Orbit/AlienRun/LocalArt/AlienRunProductLevelV7.unity";
            if (!File.Exists(level)) { Assert.Ignore("El nivel V7 local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(level, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;
            var session = Object.FindFirstObjectByType<RunSession>();
            session.bridge.StartLocalPractice();
            session.runner.ResetAt(new Vector3(332f, 1f, 0f));
            var deadline = Time.realtimeSinceStartup + 20f;
            while (session.runner.transform.position.x < 365f && Time.realtimeSinceStartup < deadline)
            {
                var x = session.runner.transform.position.x;
                session.runner.TouchAxis = 1f;
                if (NearJump(x, 350f) || NearJump(x, 357f)) session.runner.QueueTouchJump();
                yield return null;
            }
            Assert.Greater(session.runner.transform.position.x, 365f,
                $"La secuencia final no se supera: x={session.runner.transform.position.x:0.00}, deaths={session.Deaths}");
            Assert.AreEqual(0, session.Deaths, "La ruta guiada debe superar los peligros finales sin caer.");
            session.AbortRun();
#else
            Assert.Ignore("Solo se prueba en Unity Editor.");
            yield break;
#endif
        }

        [UnityTest]
        public IEnumerator ProductLevelV7SpringLaunchesFromOptionalPlatform()
        {
#if UNITY_EDITOR
            const string level = "Assets/Orbit/AlienRun/LocalArt/AlienRunProductLevelV7.unity";
            if (!File.Exists(level)) { Assert.Ignore("El nivel V7 local aún no se generó."); yield break; }
            EditorSceneManager.LoadSceneInPlayMode(level, new LoadSceneParameters(LoadSceneMode.Single));
            yield return null;
            var session = Object.FindFirstObjectByType<RunSession>();
            session.bridge.StartLocalPractice();
            session.runner.ResetAt(new Vector3(298.5f, 4f, 0f));
            var peak = session.runner.transform.position.y;
            var deadline = Time.realtimeSinceStartup + 2.5f;
            while (Time.realtimeSinceStartup < deadline)
            {
                peak = Mathf.Max(peak, session.runner.transform.position.y);
                yield return null;
            }
            Assert.Greater(peak, 5.2f, "El muelle debe lanzar al jugador sobre la plataforma.");
            session.AbortRun();
#else
            Assert.Ignore("Solo se prueba en Unity Editor.");
            yield break;
#endif
        }

        private static IEnumerator CompleteRouteTwice(RunSession session, VisualSkin skin = null,
            HashSet<string> seen = null, float extraJumpX = -1f)
        {
            for (var attempt = 0; attempt < 2; attempt++)
            {
                session.bridge.StartLocalPractice();
                Assert.AreEqual(RunState.Playing, session.State);
                var deadline = Time.realtimeSinceStartup +
                    (session.finish.position.x > 300f ? 130f : session.finish.position.x > 100f ? 90f : 35f);

                while (session.State == RunState.Playing && Time.realtimeSinceStartup < deadline)
                {
                    var x = session.runner.transform.position.x;
                    session.runner.TouchAxis = 1f;
                    var openingJump = extraJumpX > 0f ? extraJumpX : session.extraGuidedJumpX;
                    var jump = NearJump(x, 19f) || NearJump(x, 50f) ||
                        NearJump(x, 61f) || NearJump(x, 73f) ||
                        (openingJump > 0f && NearJump(x, openingJump));
                    if (session.laterGuidedJumps != null)
                        foreach (var start in session.laterGuidedJumps) jump |= NearJump(x, start);
                    if (jump)
                        session.runner.QueueTouchJump();
                    yield return null;
                    if (skin != null) seen.Add(skin.CurrentAnimationState);
                }

                Assert.AreEqual(RunState.Finished, session.State,
                    $"Attempt {attempt + 1} stopped at x={session.runner.transform.position.x:0.00}, " +
                    $"y={session.runner.transform.position.y:0.00}, deaths={session.Deaths}");
                if (skin != null)
                {
                    yield return null;
                    seen.Add(skin.CurrentAnimationState);
                }
            }
        }

        private static bool NearJump(float x, float start) => x >= start && x < start + 1f;
    }
}
