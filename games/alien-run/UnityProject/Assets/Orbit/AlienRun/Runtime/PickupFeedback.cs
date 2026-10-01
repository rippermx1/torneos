using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Orbit.AlienRun
{
    /// <summary>A small, non-physical pickup burst. Meshes and one transparent material are shared.</summary>
    public sealed class PickupFeedback : MonoBehaviour
    {
        public const int MaximumActive = 12;
        public static int ActiveCount => active.Count;
        public bool StarEffect { get; private set; }
        public float Duration => StarEffect ? .95f : .64f;
        public float Progress => Mathf.Clamp01(age / Duration);

        private static readonly List<PickupFeedback> active = new List<PickupFeedback>(MaximumActive);
        private static Material material;
        private static Mesh coinBurst, starBurst;
        private static int colorId;
        private readonly List<Renderer> ghostRenderers = new List<Renderer>(2);
        private MaterialPropertyBlock properties;
        private RunSession owner;
        private Transform ghost, burst;
        private MeshRenderer burstRenderer;
        private Camera viewCamera;
        private Vector3 origin;
        private Color rewardColor;
        private float age;
        private int runTimeAtSpawn;
        private bool owned;

        private void Awake() => properties = new MaterialPropertyBlock();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStatics()
        {
            active.Clear();
            ReleaseSharedAssets();
        }

        public static void Play(Collectible pickup, RunSession session)
        {
            if (pickup == null || !pickup.gameObject.activeInHierarchy) return;
            EnsureSharedAssets();
            if (material == null) return;
            // Dense coin arcs stay bounded. Prefer replacing a coin burst over a star celebration.
            if (active.Count >= MaximumActive)
            {
                var oldest = active[0];
                foreach (var candidate in active)
                    if (!candidate.StarEffect) { oldest = candidate; break; }
                oldest.Stop();
            }
            var root = new GameObject(pickup.isStar ? "StarPickupFeedback" : "CoinPickupFeedback");
            if (session != null) root.transform.SetParent(session.transform, true);
            root.transform.position = pickup.transform.position;
            var effect = root.AddComponent<PickupFeedback>();
            effect.owner = session;
            effect.owned = session != null;
            effect.runTimeAtSpawn = session != null ? session.RunElapsedMs : 0;
            effect.StarEffect = pickup.isStar;
            effect.origin = pickup.transform.position;
            effect.rewardColor = pickup.isStar ? new Color(1f, .93f, .55f) : new Color(1f, .73f, .13f);
            effect.CreateVisuals(pickup);
            active.Add(effect);
            effect.Draw(0f);
        }

        /// <summary>Call when a new run begins. Null clears all effects for scene/test cleanup.</summary>
        public static void Clear(RunSession session)
        {
            for (var i = active.Count - 1; i >= 0; i--)
                if (session == null || active[i].owner == session) active[i].Stop();
        }

        private static void EnsureSharedAssets()
        {
            if (material == null)
            {
                colorId = Shader.PropertyToID("_Color");
                // This built-in transparent unlit shader is included by GraphicsSettings and renders
                // in URP's SRPDefaultUnlit pass. It avoids runtime URP keyword variants being stripped.
                var shader = Shader.Find("Sprites/Default");
                if (shader == null) return;
                material = new Material(shader) { name = "PickupFeedback_Unlit", hideFlags = HideFlags.DontSave };
                material.SetColor(colorId, Color.white);
            }
            if (coinBurst == null) coinBurst = MakeBurst(4, false);
            if (starBurst == null) starBurst = MakeBurst(8, true);
        }

        private void CreateVisuals(Collectible pickup)
        {
            viewCamera = Camera.main;
            ghost = new GameObject("CollectedVisual").transform;
            ghost.SetParent(transform, false);
            // Copy only visible mesh references/transforms. No vendor scripts, colliders or rigidbodies.
            foreach (var source in pickup.GetComponentsInChildren<MeshFilter>())
            {
                var renderer = source.GetComponent<MeshRenderer>();
                if (source.sharedMesh == null || renderer == null || !renderer.enabled) continue;
                var part = new GameObject("RewardMesh");
                part.transform.SetParent(ghost, false);
                part.transform.position = source.transform.position;
                part.transform.rotation = source.transform.rotation;
                part.transform.localScale = source.transform.lossyScale;
                part.AddComponent<MeshFilter>().sharedMesh = source.sharedMesh;
                var copy = part.AddComponent<MeshRenderer>();
                Configure(copy);
                ghostRenderers.Add(copy);
            }
            burst = new GameObject("RewardSparkles").transform;
            burst.SetParent(transform, false);
            burst.gameObject.AddComponent<MeshFilter>().sharedMesh = StarEffect ? starBurst : coinBurst;
            burstRenderer = burst.gameObject.AddComponent<MeshRenderer>();
            Configure(burstRenderer);
        }

        private static void Configure(MeshRenderer renderer)
        {
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
            renderer.allowOcclusionWhenDynamic = false;
        }

        private void Update()
        {
            if (owned && (owner == null || owner.State == RunState.Idle || owner.State == RunState.Failed ||
                (owner.State == RunState.Playing && owner.RunElapsedMs < runTimeAtSpawn)))
            {
                Stop();
                return;
            }
            age += Time.deltaTime;
            if (age >= Duration) { Stop(); return; }
            Draw(Progress);
        }

        private void Draw(float t)
        {
            var eased = 1f - Mathf.Pow(1f - t, 2f);
            transform.position = origin + Vector3.up * eased * (StarEffect ? 1.8f : 1.15f);
            ghost.localRotation = Quaternion.Euler(0f, eased * (StarEffect ? 300f : 460f), 0f);
            var pop = 1f + Mathf.Sin(Mathf.Min(1f, t * 3f) * Mathf.PI) * (StarEffect ? .45f : .28f);
            ghost.localScale = Vector3.one * pop * Mathf.Lerp(1f, .45f,
                Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(.35f, 1f, t)));
            var alpha = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(.22f, 1f, t));
            SetColor(rewardColor, alpha);
            foreach (var renderer in ghostRenderers) renderer.SetPropertyBlock(properties);

            // One combined sparkle mesh, aligned with the camera, instead of a particle system per coin.
            if (viewCamera != null) burst.rotation = viewCamera.transform.rotation;
            burst.localScale = Vector3.one * Mathf.Lerp(.28f, StarEffect ? 1.65f : 1.15f, eased);
            var sparkleColor = StarEffect ? new Color(1f, .98f, .78f) : new Color(1f, .9f, .45f);
            SetColor(sparkleColor, alpha * .9f);
            burstRenderer.SetPropertyBlock(properties);
        }

        private void SetColor(Color color, float alpha)
        {
            color.a = alpha;
            properties.SetColor(colorId, color);
        }

        private void Stop()
        {
            active.Remove(this);
            gameObject.SetActive(false);
            Destroy(gameObject);
        }

        private void OnDestroy()
        {
            active.Remove(this);
            if (active.Count == 0) ReleaseSharedAssets();
        }

        private static void ReleaseSharedAssets()
        {
            if (material != null) Destroy(material);
            if (coinBurst != null) Destroy(coinBurst);
            if (starBurst != null) Destroy(starBurst);
            material = null;
            coinBurst = starBurst = null;
        }

        private static Mesh MakeBurst(int sparkles, bool ring)
        {
            var vertices = new List<Vector3>(ring ? 108 : 16);
            var triangles = new List<int>(ring ? 180 : 24);
            for (var i = 0; i < sparkles; i++)
            {
                var angle = (i + .5f) / sparkles * Mathf.PI * 2f;
                var radial = new Vector3(Mathf.Cos(angle), Mathf.Sin(angle), 0f);
                var tangent = new Vector3(-radial.y, radial.x, 0f);
                var center = radial * .6f;
                var start = vertices.Count;
                vertices.Add(center + radial * .11f);
                vertices.Add(center + tangent * .04f);
                vertices.Add(center - radial * .11f);
                vertices.Add(center - tangent * .04f);
                triangles.AddRange(new[] { start, start + 2, start + 1, start, start + 3, start + 2 });
            }
            if (ring)
            {
                const int segments = 24;
                var start = vertices.Count;
                for (var i = 0; i <= segments; i++)
                {
                    var angle = i / (float)segments * Mathf.PI * 2f;
                    var direction = new Vector3(Mathf.Cos(angle), Mathf.Sin(angle), 0f);
                    vertices.Add(direction * .37f);
                    vertices.Add(direction * .395f);
                    if (i == segments) continue;
                    var p = start + i * 2;
                    triangles.AddRange(new[] { p, p + 2, p + 1, p + 1, p + 2, p + 3 });
                }
            }
            var mesh = new Mesh { name = ring ? "StarPickupSparkles" : "CoinPickupSparkles", hideFlags = HideFlags.DontSave };
            mesh.SetVertices(vertices);
            mesh.SetTriangles(triangles, 0);
            var colors = new Color[vertices.Count];
            for (var i = 0; i < colors.Length; i++) colors[i] = Color.white;
            mesh.colors = colors;
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
