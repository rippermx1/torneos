using UnityEngine;

namespace Orbit.AlienRun
{
    [RequireComponent(typeof(RunSession))]
    public sealed class RunHud : MonoBehaviour
    {
        private RunSession session;
        private RectTransform safeAreaRoot;
        private RectTransform panel;
        private UnityEngine.UI.Text timeText;
        private UnityEngine.UI.Text crystalText;
        private UnityEngine.UI.Text deathsText;
        private UnityEngine.UI.Text checkpointText;
        private UnityEngine.UI.Text statusText;
        private UnityEngine.UI.Text gearText;
        private Rect lastSafeArea;
        private int lastWidth;
        private int lastHeight;

        private void Awake()
        {
            session = GetComponent<RunSession>();
            CreateHud();
        }

        private void LateUpdate()
        {
            UpdateSafeArea();
            SetText(timeText, $"TIEMPO {session.RunElapsedMs / 1000f:0.0}s");
            SetText(crystalText, session.RequiredCollectibles > 0
                ? $"{session.collectibleLabel} {session.CollectedCount}/{session.CollectibleCount} · META {session.RequiredCollectibles}"
                : $"{session.collectibleLabel} {session.CollectedCount}/{session.CollectibleCount}");
            SetText(deathsText, $"CAÍDAS {session.Deaths}");
            var weapon=session.runner.GetComponent<AxeWeapon>();
            SetText(gearText, $"ESTRELLAS {session.StarCount}/{session.StarTotal}     HACHAS {weapon?.Ammo ?? 0}" +
                (weapon != null && weapon.Ammo>0 ? " · X / HACHA" : " · Rompe cajas desde abajo"));
            SetText(checkpointText, session.State == RunState.Idle
                ? "CHECKPOINT · pendiente"
                : session.CheckpointReached
                    ? session.CheckpointCount > 1
                        ? $"CHECKPOINT · {session.ActiveCheckpoint}/{session.CheckpointCount}"
                        : "CHECKPOINT · activo"
                    : "CHECKPOINT · pendiente");
            checkpointText.color = session.CheckpointReached
                ? new Color(.63f, .94f, .72f) : new Color(1f, .82f, .54f);
            SetText(statusText, session.StatusMessage);
        }

        private void CreateHud()
        {
            var canvasObject = new GameObject("RunHudCanvas", typeof(RectTransform), typeof(Canvas),
                typeof(UnityEngine.UI.CanvasScaler));
            canvasObject.transform.SetParent(transform, false);
            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 90;
            var scaler = canvasObject.GetComponent<UnityEngine.UI.CanvasScaler>();
            scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(960f, 540f);
            scaler.screenMatchMode = UnityEngine.UI.CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = .5f;

            var safeObject = new GameObject("SafeArea", typeof(RectTransform));
            safeObject.transform.SetParent(canvasObject.transform, false);
            safeAreaRoot = safeObject.GetComponent<RectTransform>();
            safeAreaRoot.anchorMin = Vector2.zero;
            safeAreaRoot.anchorMax = Vector2.one;
            safeAreaRoot.offsetMin = safeAreaRoot.offsetMax = Vector2.zero;

            var panelObject = new GameObject("StatusPanel", typeof(RectTransform), typeof(UnityEngine.UI.Image));
            panelObject.transform.SetParent(safeAreaRoot, false);
            panel = panelObject.GetComponent<RectTransform>();
            panel.anchorMin = panel.anchorMax = new Vector2(0f, 1f);
            panel.pivot = new Vector2(0f, 1f);
            panel.anchoredPosition = new Vector2(10f, -8f);
            panel.sizeDelta = new Vector2(720f, session.runner.GetComponent<AxeWeapon>() != null ? 128f : 104f);
            var background = panelObject.GetComponent<UnityEngine.UI.Image>();
            background.color = new Color(.045f, .095f, .16f, .84f);
            background.raycastTarget = false;

            var metricsObject = new GameObject("Metrics", typeof(RectTransform), typeof(UnityEngine.UI.HorizontalLayoutGroup));
            metricsObject.transform.SetParent(panel, false);
            var metricsRect = metricsObject.GetComponent<RectTransform>();
            metricsRect.anchorMin = new Vector2(0f, 1f);
            metricsRect.anchorMax = new Vector2(1f, 1f);
            metricsRect.pivot = new Vector2(.5f, 1f);
            metricsRect.anchoredPosition = new Vector2(0f, -8f);
            metricsRect.sizeDelta = new Vector2(-20f, 32f);
            var layout = metricsObject.GetComponent<UnityEngine.UI.HorizontalLayoutGroup>();
            layout.spacing = 6f;
            layout.childAlignment = TextAnchor.MiddleCenter;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;
            timeText = CreateText("Time", metricsRect, 21, TextAnchor.MiddleLeft, Color.white);
            crystalText = CreateText("Crystals", metricsRect, 21, TextAnchor.MiddleCenter, Color.white);
            deathsText = CreateText("Deaths", metricsRect, 21, TextAnchor.MiddleRight, Color.white);
            foreach (var label in new[] { timeText, crystalText, deathsText })
            {
                var element = label.gameObject.AddComponent<UnityEngine.UI.LayoutElement>();
                element.flexibleWidth = 1f;
                element.minWidth = 0f;
            }

            checkpointText = CreateText("Checkpoint", panel, 18, TextAnchor.MiddleLeft, Color.white);
            PlaceText(checkpointText.rectTransform, 41f, 21f);
            statusText = CreateText("Status", panel, 17, TextAnchor.UpperLeft, Color.white);
            statusText.horizontalOverflow = HorizontalWrapMode.Wrap;
            PlaceText(statusText.rectTransform, 65f, 24f);
            if(session.runner.GetComponent<AxeWeapon>() != null) {
                gearText=CreateText("Gear",panel,17,TextAnchor.MiddleLeft,new Color(1f,.85f,.35f));
                PlaceText(gearText.rectTransform,95f,22f);
            }
        }

        private static UnityEngine.UI.Text CreateText(string name, Transform parent, int fontSize,
            TextAnchor alignment, Color color)
        {
            var item = new GameObject(name, typeof(RectTransform), typeof(UnityEngine.UI.Text));
            item.transform.SetParent(parent, false);
            var label = item.GetComponent<UnityEngine.UI.Text>();
            label.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            label.fontSize = fontSize;
            label.fontStyle = FontStyle.Bold;
            label.alignment = alignment;
            label.color = color;
            label.raycastTarget = false;
            label.resizeTextForBestFit = true;
            label.resizeTextMinSize = 14;
            label.resizeTextMaxSize = fontSize;
            return label;
        }

        private static void PlaceText(RectTransform rect, float top, float height)
        {
            rect.anchorMin = new Vector2(0f, 1f);
            rect.anchorMax = new Vector2(1f, 1f);
            rect.pivot = new Vector2(.5f, 1f);
            rect.anchoredPosition = new Vector2(0f, -top);
            rect.sizeDelta = new Vector2(-24f, height);
        }

        private void UpdateSafeArea()
        {
            if (Screen.width == 0 || Screen.height == 0) return;
            var area = Screen.safeArea;
            if (area == lastSafeArea && Screen.width == lastWidth && Screen.height == lastHeight) return;
            lastSafeArea = area;
            lastWidth = Screen.width;
            lastHeight = Screen.height;
            safeAreaRoot.anchorMin = new Vector2(area.xMin / Screen.width, area.yMin / Screen.height);
            safeAreaRoot.anchorMax = new Vector2(area.xMax / Screen.width, area.yMax / Screen.height);
            safeAreaRoot.offsetMin = safeAreaRoot.offsetMax = Vector2.zero;
            Canvas.ForceUpdateCanvases();
            panel.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal,
                Mathf.Min(720f, Mathf.Max(0f, safeAreaRoot.rect.width - 20f)));
        }

        private static void SetText(UnityEngine.UI.Text label, string value)
        {
            if (label != null && label.text != value) label.text = value;
        }
    }
}
