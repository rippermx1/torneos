using System.Collections.Generic;
using Orbit.SDK;
using UnityEngine;
namespace Orbit.AlienRun
{
    public enum RunState { Idle, Playing, Finished, Failed }
    public sealed class RunSession : MonoBehaviour
    {
        public OrbitBridge bridge;
        public RunnerMotor runner;
        public Collectible[] collectibles;
        public Transform finish;
        public Vector3 spawn = new Vector3(0, 2f, 0);
        public Vector3 checkpoint = new Vector3(46f, 2f, 0);
        public Vector3[] laterCheckpoints = System.Array.Empty<Vector3>();
        public CheckpointFlag[] checkpointFlags = System.Array.Empty<CheckpointFlag>();
        private PlayerTransitions transitions;
        public bool ControlsLocked => transitions!=null && transitions.Busy;
        public bool PlayerVulnerable => State==RunState.Playing && !ControlsLocked;
        public void CompleteEntrance() => started=Time.realtimeSinceStartupAsDouble;
        [Min(0)] public int requiredCollectibles;
        public string collectibleLabel = "CRISTALES";
        public float extraGuidedJumpX = -1f;
        public float[] laterGuidedJumps = System.Array.Empty<float>();
        public RunState State { get; private set; } = RunState.Idle;
        public bool CheckpointReached => checkpointReached;
        public int ActiveCheckpoint => activeCheckpoint;
        public int CheckpointCount => checkpointFlags!=null && checkpointFlags.Length>0 ? checkpointFlags.Length : 1 + (laterCheckpoints != null ? laterCheckpoints.Length : 0);
        public int Deaths => deaths;
        private int coinsCollected;
        public int CollectedCount => coinsCollected;
        public int StarCount => collected.Count - coinsCollected;
        public int StarTotal => CountCollectibles(true);
        public int CollectibleCount => CountCollectibles(false);
        private int CountCollectibles(bool stars) {
            var count=0; if(collectibles != null) foreach(var c in collectibles) if(c != null && c.isStar==stars) count++;
            return count;
        }
        public void ShowHint(string text) => message = text;
        public int RequiredCollectibles => requiredCollectibles;
        public int RunElapsedMs => State == RunState.Playing ? ElapsedMs : finishedElapsedMs;
        public string StatusMessage => message;
        public bool GuidedRouteActive => guidedRoute;
        private readonly HashSet<string> collected = new HashSet<string>();
        private RunConfig config;
        private double started;
        private double lastDeath = -100;
        private int deaths;
        private int finishedElapsedMs;
        private bool checkpointReached;
        private int activeCheckpoint;
        private bool guidedRoute;
        private string message = "Práctica. Sin premios.";
        private void Start()
        {
            transitions=GetComponent<PlayerTransitions>();
            runner.Playing = false;
            runner.ResetAt(runner.GroundPosition(spawn));
            if (!TryGetComponent<MobileControls>(out _)) gameObject.AddComponent<MobileControls>();
            if (!TryGetComponent<RunHud>(out _)) gameObject.AddComponent<RunHud>();
            bridge.RunStarted += Begin;
            bridge.AnnounceReady(BuildIdentity.GameId, BuildIdentity.BuildId, BuildIdentity.RulesetVersion);
        }
        private void OnDestroy() { if (bridge != null) bridge.RunStarted -= Begin; }
        private void Begin(RunConfig value)
        {
            PickupFeedback.Clear(this);
            if(transitions!=null)transitions.Cancel();
            config = value; collected.Clear(); deaths = 0; finishedElapsedMs = 0;
            coinsCollected=0;
            runner.GetComponent<AxeWeapon>()?.ResetForRun();
            foreach(var pickup in FindObjectsByType<AxePickup>(FindObjectsSortMode.None)) if(pickup.session==this) Destroy(pickup.gameObject);
            foreach(var axe in FindObjectsByType<AxeProjectile>(FindObjectsSortMode.None)) if(axe.session==this) Destroy(axe.gameObject);
            foreach(var block in FindObjectsByType<BreakableBlock>(FindObjectsSortMode.None)) block.ResetForRun();
            foreach(var enemy in FindObjectsByType<PatrolEnemy>(FindObjectsInactive.Include,FindObjectsSortMode.None)) if(enemy.enabled && enemy.session==this) enemy.ResetForRun();
            foreach(var hazard in FindObjectsByType<MovingHazard>(FindObjectsSortMode.None)) if(hazard.session==this) hazard.ResetForRun();
            foreach(var hazard in FindObjectsByType<PendulumHazard>(FindObjectsSortMode.None)) if(hazard.session==this) hazard.ResetForRun();
            foreach(var flag in checkpointFlags)if(flag!=null)flag.ResetForRun();
            foreach(var trap in FindObjectsByType<SpikeTrap>(FindObjectsSortMode.None))if(trap.session==this)trap.ResetForRun();
            foreach(var pad in FindObjectsByType<BouncePad>(FindObjectsSortMode.None))if(pad.session==this)pad.ResetForRun();
            foreach(var platform in FindObjectsByType<MovingPlatform>(FindObjectsSortMode.None))if(platform.session==this)platform.ResetForRun();
            foreach(var enemy in FindObjectsByType<EnemyAxeThrower>(FindObjectsInactive.Include,FindObjectsSortMode.None))if(enemy.session==this)enemy.ResetForRun();
            checkpointReached = false; activeCheckpoint = 0; lastDeath = -100;
            guidedRoute = false;
            foreach (var item in collectibles) if (item != null) item.gameObject.SetActive(true);
            runner.ResetAt(spawn); started = Time.realtimeSinceStartupAsDouble;
            State = RunState.Playing; runner.Playing = true;
            if(transitions!=null)transitions.BeginEntrance(spawn);
            message = requiredCollectibles > 0
                ? $"Recoge {requiredCollectibles} {collectibleLabel.ToLowerInvariant()} y llega a la meta."
                : "Llega a la baliza. Explora la ruta elevada.";
        }
        private int ElapsedMs => transitions!=null && transitions.Entering ? 0 : Mathf.Max(0, (int)((Time.realtimeSinceStartupAsDouble - started) * 1000));
        private void Update()
        {
            if (State != RunState.Playing) return;
            if (ElapsedMs > config.max_duration_ms) { StopFailed("Tiempo agotado. Inicia otra práctica."); return; }
            if (ControlsLocked) return;
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            if (guidedRoute)
            {
                var navigator=GetComponent<PracticeNavigator>();
                if(navigator!=null)navigator.Drive();
                else {
                var x = runner.transform.position.x;
                runner.TouchAxis = 1f;
                var jump = NearJump(x, 19f) || NearJump(x, 50f) || NearJump(x, 61f) || NearJump(x, 73f) ||
                    (extraGuidedJumpX > 0f && NearJump(x, extraGuidedJumpX));
                if (laterGuidedJumps != null)
                    foreach (var start in laterGuidedJumps) jump |= NearJump(x, start);
                if (jump)
                    runner.QueueTouchJump();
                }
            }
#endif
            if (ElapsedMs > config.max_duration_ms) { StopFailed("Tiempo agotado. Inicia otra práctica."); return; }
            if (runner.transform.position.y < -7f) { Respawn(); return; }
            if (checkpointFlags.Length==0 && !checkpointReached && runner.transform.position.x >= checkpoint.x && runner.transform.position.y > 0)
            {
                checkpointReached = true;
                activeCheckpoint = 1;
                message = "Checkpoint activado. Si caes, reapareces aquí.";
            }
            if (checkpointFlags.Length==0 && laterCheckpoints != null)
                for (var i = activeCheckpoint > 0 ? activeCheckpoint - 1 : 0; i < laterCheckpoints.Length; i++)
                    if (runner.transform.position.x >= laterCheckpoints[i].x && runner.transform.position.y > 0f)
                    {
                        activeCheckpoint = i + 2;
                        message = $"Checkpoint {activeCheckpoint}/{CheckpointCount} activado.";
                    }
            foreach (var item in collectibles)
            {
                if (item == null || !item.gameObject.activeSelf) continue;
                if (Vector3.Distance(runner.transform.position, item.transform.position) < 1.35f)
                {
                    if(collected.Add(item.collectibleId) && !item.isStar) coinsCollected++;
                    item.Collect(this);
                }
            }
            if (Vector3.Distance(runner.transform.position, finish.position) < 1.8f)
            {
                if (coinsCollected < requiredCollectibles)
                {
                    message = $"Faltan {requiredCollectibles - coinsCollected} {collectibleLabel.ToLowerInvariant()} para abrir la meta.";
                    return;
                }
                finishedElapsedMs = ElapsedMs;
                State = RunState.Finished; runner.Playing = false;
                var ids = new List<string>(collected); ids.Sort(System.StringComparer.Ordinal);
                bridge.Finish(new RunResult { duration_ms = Mathf.Max(1000, ElapsedMs),
                    collected_ids = ids.ToArray(), deaths = deaths, finished = true });
                message = "Meta alcanzada. Resultado enviado al portal de práctica.";
            }
        }
#if UNITY_EDITOR || DEVELOPMENT_BUILD
        private static bool NearJump(float x, float start) => x >= start && x < start + 1f;
#endif
        public void Respawn()
        {
            if (!PlayerVulnerable || Time.realtimeSinceStartupAsDouble - lastDeath < 0.4) return;
            lastDeath = Time.realtimeSinceStartupAsDouble; deaths++;
            if (deaths > 99) { StopFailed("Límite de reintentos alcanzado."); return; }
            var respawn = checkpointFlags.Length>0 && activeCheckpoint>0 ? checkpointFlags[activeCheckpoint-1].respawnPoint : activeCheckpoint > 1 ? laterCheckpoints[activeCheckpoint - 2] :
                checkpointReached ? checkpoint : spawn;
            if(transitions!=null)transitions.DieAndReturn(respawn);else runner.ResetAt(respawn);
            message = checkpointReached ? "Reapareciste en el checkpoint." : "Reapareciste al inicio.";
        }
        public void AbortRun() { if (State == RunState.Playing) StopFailed("Práctica cancelada. Puedes iniciar otra."); }
        public bool ActivateCheckpoint(CheckpointFlag flag)
        {
            if(!PlayerVulnerable)return false;
            var index=System.Array.IndexOf(checkpointFlags,flag)+1;
            if(index<=activeCheckpoint)return false;
            checkpointReached=true;activeCheckpoint=index;
            message=$"Checkpoint {activeCheckpoint}/{CheckpointCount} activado.";return true;
        }
        public void ClearProjectiles()
        {
            foreach(var axe in FindObjectsByType<AxeProjectile>(FindObjectsSortMode.None))if(axe.session==this)Destroy(axe.gameObject);
        }
        private void StopFailed(string reason)
        {
            if(transitions!=null)transitions.Cancel();
            finishedElapsedMs = ElapsedMs;
            State = RunState.Failed; runner.Playing = false; message = reason; bridge.Abort(reason);
        }
        // Local and development actions remain separate from the runtime HUD.
        private void OnGUI()
        {
            if(ControlsLocked)return;
            var hudScale = Mathf.Sqrt((Screen.width / 960f) * (Screen.height / 540f));
            var debugY = Screen.height - Screen.safeArea.yMax + 148f * hudScale;
#if UNITY_EDITOR || !UNITY_WEBGL
            if (State != RunState.Playing && GUI.Button(new Rect(12, debugY, 220, 42), "Iniciar práctica local"))
                bridge.StartLocalPractice(BuildIdentity.MaxDurationMs);
#endif
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            if (State == RunState.Playing && !guidedRoute &&
                GUI.Button(new Rect(12, debugY, 300, 42), "Recorrido guiado (solo desarrollo)"))
            {
                guidedRoute = true;
                message = "Recorrido guiado de desarrollo activo.";
            }
#endif
        }
    }
}
