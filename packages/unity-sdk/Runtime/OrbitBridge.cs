using System;
using System.Runtime.InteropServices;
using UnityEngine;
namespace Orbit.SDK
{
    /// <summary>Small browser adapter. Authentication and HTTP live in the portal, not in the game.</summary>
    public sealed class OrbitBridge : MonoBehaviour
    {
        public event Action<RunConfig> RunStarted;
        private string buildId;
        private string rulesVersion;
        private string gameId;
        private RunConfig active;
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void Orbit_PostMessage(string json);
#endif
        public void AnnounceReady(string game, string build, string rules)
        {
            gameId = game; buildId = build; rulesVersion = rules;
            gameObject.name = "OrbitBridge";
            Send(new GameMessage { type = "game.ready", build_id = buildId, ruleset_version = rulesVersion });
        }
        // Called by the WebGL template through unityInstance.SendMessage.
        public void OnPlatformStart(string json)
        {
            try
            {
                var config = JsonUtility.FromJson<RunConfig>(json);
                if (config == null || string.IsNullOrEmpty(config.run_id) || config.game_id != gameId ||
                    config.build_id != buildId || config.ruleset_version != rulesVersion ||
                    config.mode != "practice" || config.max_duration_ms < 1000 || config.max_duration_ms > 600000)
                    throw new ArgumentException("Configuración de partida inválida o incompatible.");
                if (active != null)
                {
                    if (active.run_id == config.run_id) return;
                    throw new InvalidOperationException("Ya existe una partida en curso.");
                }
                active = config;
                RunStarted?.Invoke(config);
            }
            catch (Exception error)
            {
                active = null;
                Debug.LogException(error);
                Send(new GameMessage { type = "game.error", message = error.Message });
            }
        }
        public void Finish(RunResult result)
        {
            if (active == null) return;
            result.build_id = active.build_id;
            result.ruleset_version = active.ruleset_version;
            Send(new GameMessage { type = "game.finished", run_id = active.run_id, result = result });
            active = null;
        }
        public void Abort(string reason)
        {
            active = null;
            Send(new GameMessage { type = "game.error", message = reason });
        }
        public void StartLocalPractice(int maxDurationMs = 180000)
        {
#if UNITY_EDITOR || !UNITY_WEBGL
            OnPlatformStart(JsonUtility.ToJson(new RunConfig {
                run_id = Guid.NewGuid().ToString(), game_id = gameId, build_id = buildId,
                ruleset_version = rulesVersion, mode = "practice", max_duration_ms = maxDurationMs,
                seed = 20260928, expires_at_ms = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + maxDurationMs + 60000
            }));
#endif
        }
        private static void Send(GameMessage message)
        {
            var json = JsonUtility.ToJson(message);
#if UNITY_WEBGL && !UNITY_EDITOR
            Orbit_PostMessage(json);
#else
            Debug.Log("[OrbitBridge local only] " + json);
#endif
        }
    }
}
