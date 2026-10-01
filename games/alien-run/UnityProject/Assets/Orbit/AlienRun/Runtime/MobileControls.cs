using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;

namespace Orbit.AlienRun
{
    [RequireComponent(typeof(RunSession))]
    public sealed class MobileControls : MonoBehaviour
    {
        private RunSession session;
        private RunnerMotor runner;
        private RectTransform safeAreaRoot;
        private TouchHoldButton left;
        private TouchHoldButton right;
        private TouchHoldButton jump;
        private TouchHoldButton attack;
        private bool attackWasHeld;
        private bool jumpWasHeld;
        private Rect lastSafeArea;
        private int lastWidth;
        private int lastHeight;
        public bool ControlsVisible => safeAreaRoot != null;

        private void Awake()
        {
            session = GetComponent<RunSession>();
            runner = session.runner;
        }

        private void Update()
        {
            if (!ControlsVisible)
            {
                if (Touchscreen.current == null) return;
                CreateControls();
            }
            UpdateSafeArea();
            if (session.State != RunState.Playing || session.ControlsLocked)
            {
                ClearInput();
                if(attack != null)attack.gameObject.SetActive(false);
                return;
            }
            if (session.GuidedRouteActive)
            {
                ClearInput(false);
                return;
            }
            runner.TouchAxis = (right.IsPressed ? 1 : 0) - (left.IsPressed ? 1 : 0);
            var pressed = jump.IsPressed;
            if (pressed && !jumpWasHeld) runner.PressTouchJump();
            else if (!pressed && jumpWasHeld) runner.ReleaseTouchJump();
            jumpWasHeld = pressed;
            var weapon=runner.GetComponent<AxeWeapon>();
            if(attack != null)
            {
                attack.gameObject.SetActive(weapon != null && weapon.Ammo>0);
                var firing=attack.IsPressed;
                if(firing && !attackWasHeld) weapon?.TryThrow();
                attackWasHeld=firing;
            }
        }

        public void ClearInput(bool clearAxis = true)
        {
            left?.Clear(); right?.Clear(); jump?.Clear(); attack?.Clear(); attackWasHeld=false;
            if (jumpWasHeld) runner.ReleaseTouchJump();
            jumpWasHeld = false;
            if (clearAxis && runner != null) runner.TouchAxis = 0;
        }

        private void OnApplicationFocus(bool focused) { if (!focused) ClearInput(); }
        private void OnApplicationPause(bool paused) { if (paused) ClearInput(); }
        private void OnDisable() => ClearInput();

        private void CreateControls()
        {
            if (FindFirstObjectByType<EventSystem>() == null)
            {
                var events = new GameObject("MobileEventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
                events.transform.SetParent(transform, false);
            }
            var canvasObject = new GameObject("MobileControlsCanvas", typeof(RectTransform),
                typeof(Canvas), typeof(UnityEngine.UI.CanvasScaler), typeof(UnityEngine.UI.GraphicRaycaster));
            canvasObject.transform.SetParent(transform, false);
            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            var scaler = canvasObject.GetComponent<UnityEngine.UI.CanvasScaler>();
            scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(960f, 540f);
            scaler.screenMatchMode = UnityEngine.UI.CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0.5f;

            var safeObject = new GameObject("SafeArea", typeof(RectTransform));
            safeObject.transform.SetParent(canvasObject.transform, false);
            safeAreaRoot = safeObject.GetComponent<RectTransform>();
            UpdateSafeArea();
            left = CreateButton("MoveLeft", "IZQ", new Vector2(0, 0), new Vector2(0, 0),
                new Vector2(20, 18), new Vector2(124, 120));
            right = CreateButton("MoveRight", "DER", new Vector2(0, 0), new Vector2(0, 0),
                new Vector2(156, 18), new Vector2(124, 120));
            jump = CreateButton("Jump", "SALTO", new Vector2(1, 0), new Vector2(1, 0),
                new Vector2(-20, 18), new Vector2(156, 120));
            attack = CreateButton("ThrowAxe", "HACHA", new Vector2(1,0), new Vector2(1,0),
                new Vector2(-188,18),new Vector2(112,100));
            attack.gameObject.SetActive(false);
        }

        private TouchHoldButton CreateButton(string name, string label, Vector2 anchor, Vector2 pivot,
            Vector2 position, Vector2 size)
        {
            var button = new GameObject(name, typeof(RectTransform), typeof(UnityEngine.UI.Image), typeof(TouchHoldButton));
            button.transform.SetParent(safeAreaRoot, false);
            var rect = button.GetComponent<RectTransform>();
            rect.anchorMin = rect.anchorMax = anchor;
            rect.pivot = pivot;
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            var image = button.GetComponent<UnityEngine.UI.Image>();
            image.raycastTarget = true;

            var caption = new GameObject("Label", typeof(RectTransform), typeof(UnityEngine.UI.Text));
            caption.transform.SetParent(button.transform, false);
            var captionRect = caption.GetComponent<RectTransform>();
            captionRect.anchorMin = Vector2.zero;
            captionRect.anchorMax = Vector2.one;
            captionRect.offsetMin = captionRect.offsetMax = Vector2.zero;
            var text = caption.GetComponent<UnityEngine.UI.Text>();
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.text = label;
            text.fontSize = 25;
            text.fontStyle = FontStyle.Bold;
            text.alignment = TextAnchor.MiddleCenter;
            text.color = Color.white;
            text.raycastTarget = false;
            return button.GetComponent<TouchHoldButton>();
        }

        private void UpdateSafeArea()
        {
            if (safeAreaRoot == null || Screen.width == 0 || Screen.height == 0) return;
            var area = Screen.safeArea;
            if (area == lastSafeArea && Screen.width == lastWidth && Screen.height == lastHeight) return;
            lastSafeArea = area;
            lastWidth = Screen.width;
            lastHeight = Screen.height;
            safeAreaRoot.anchorMin = new Vector2(area.xMin / Screen.width, area.yMin / Screen.height);
            safeAreaRoot.anchorMax = new Vector2(area.xMax / Screen.width, area.yMax / Screen.height);
            safeAreaRoot.offsetMin = safeAreaRoot.offsetMax = Vector2.zero;
        }
    }
}
