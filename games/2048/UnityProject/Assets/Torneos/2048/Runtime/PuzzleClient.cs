using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;

namespace Torneos.Puzzle2048
{
    [Serializable] public sealed class PuzzleState {
        public int[] cells; public int score, move_number, time_left_seconds = -1;
        public bool locked, game_over, can_restart, reduced_motion; public string mode, message;
    }
    public sealed class PuzzleClient : MonoBehaviour
    {
        public const string BuildId = "unity-2048-007";
        static readonly Color Ink = new Color(.10f, .20f, .22f);
        static readonly CultureInfo ScoreCulture = CultureInfo.GetCultureInfo("es-CL");
        readonly UnityEngine.UI.Image[] tiles = new UnityEngine.UI.Image[16];
        readonly TextMeshProUGUI[] numbers = new TextMeshProUGUI[16];
        readonly List<GameObject> ghosts = new List<GameObject>();
        TextMeshProUGUI scoreText, gainText;
        RectTransform board;
        GameObject canvasRoot, ownedEventSystem;
        Sprite tileFace; TMP_FontAsset font; Material faceMaterial;
        PuzzleState state; PracticeBoard practice;
        string pendingDirection; float nextInput;
        Coroutine motion;
        public bool IsAnimating => motion != null;
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void Torneos2048Event(string json);
#endif
        void Send(string direction = null) {
#if UNITY_WEBGL && !UNITY_EDITOR
            Torneos2048Event(JsonUtility.ToJson(new ClientEvent { type = direction == null ? "game.ready" : "game.input", direction = direction, build_id = BuildId }));
#endif
        }
        [Serializable] sealed class ClientEvent { public string channel = "torneos.2048"; public int version = 1; public string type, direction, build_id; }
        void Start() {
            Application.targetFrameRate = 60;
            CreateUI();
#if UNITY_WEBGL && !UNITY_EDITOR
            ApplyState(new PuzzleState { cells = new int[16], locked = true });
            Send();
#else
            practice = new PracticeBoard(Environment.TickCount); RenderPractice();
#endif
        }
        public void OnPlatformState(string json) { ApplyState(JsonUtility.FromJson<PuzzleState>(json)); }
        public void ApplyState(PuzzleState value) {
            if (value == null || value.cells == null || value.cells.Length != 16) return;
            bool changed = state == null || state.score != value.score || state.move_number != value.move_number;
            for (int i = 0; i < 16 && !changed; i++) changed |= state.cells[i] != value.cells[i];
            var previous = state;
            // Snapshot: Editor practice and later bridge messages may reuse arrays.
            state = new PuzzleState { cells = (int[])value.cells.Clone(), score = value.score, move_number = value.move_number,
                locked = value.locked, game_over = value.game_over, reduced_motion = value.reduced_motion };
            if (!changed) {
                if (!value.locked) pendingDirection = null;
                if (value.reduced_motion && IsAnimating) { StopMotion(); RenderBoard(); }
                return;
            }
            var plan = previous != null && value.move_number == previous.move_number + 1 && value.score >= previous.score
                ? TileMotionPlan.Confirm(previous.cells, value.cells, pendingDirection) : null;
            pendingDirection = null;
            StopMotion(); RenderBoard();
            scoreText.text = state.score.ToString("N0", ScoreCulture);
            if (plan != null && !state.reduced_motion) motion = StartCoroutine(Animate(plan, state.score - previous.score));
        }
        public void RequestDirection(string direction) {
            if (direction != "left" && direction != "right" && direction != "up" && direction != "down") return;
            if (state == null || state.locked || state.game_over || IsAnimating || Time.unscaledTime < nextInput) return;
            nextInput = Time.unscaledTime + .09f; pendingDirection = direction;
#if UNITY_WEBGL && !UNITY_EDITOR
            Send(direction);
#else
            // Offline Editor preview only; WebGL always waits for the platform.
            if (practice == null) return;
            bool previewChanged = practice.Score != state.score;
            for (int i = 0; i < 16; i++) previewChanged |= practice.Cells[i] != state.cells[i];
            if (previewChanged) practice = new PracticeBoard(state.cells, state.score);
            bool moved = practice.Move(direction);
            RenderPractice(state.move_number + (moved ? 1 : 0));
#endif
        }
        void RenderPractice(int move = 2) {
            bool over = !practice.CanMove();
            ApplyState(new PuzzleState { cells = practice.Cells, score = practice.Score, move_number = move, locked = over, game_over = over, reduced_motion = state?.reduced_motion ?? false });
        }
        void Update() {
            var k = Keyboard.current; if (k == null) return;
            if (k.leftArrowKey.wasPressedThisFrame || k.aKey.wasPressedThisFrame) RequestDirection("left");
            else if (k.rightArrowKey.wasPressedThisFrame || k.dKey.wasPressedThisFrame) RequestDirection("right");
            else if (k.upArrowKey.wasPressedThisFrame || k.wKey.wasPressedThisFrame) RequestDirection("up");
            else if (k.downArrowKey.wasPressedThisFrame || k.sKey.wasPressedThisFrame) RequestDirection("down");
        }
        static Vector2 Position(int index) => new Vector2((index % 4 - 1.5f) * 160, (1.5f - index / 4) * 160);
        void RenderBoard() {
            for (int i = 0; i < 16; i++) {
                SetTile(tiles[i], numbers[i], state.cells[i]);
                tiles[i].gameObject.SetActive(state.cells[i] != 0);
                tiles[i].rectTransform.localScale = Vector3.one;
            }
        }
        static void SetTile(UnityEngine.UI.Image image, TextMeshProUGUI number, int value) {
            image.color = TileColor(value); number.text = value == 0 ? "" : value.ToString();
            number.fontSize = value >= 10000 ? 40 : value >= 1000 ? 52 : value >= 100 ? 62 : 72;
            number.color = value >= 8 && value <= 64 ? Color.white : Ink;
        }
        IEnumerator Animate(TileMotionPlan plan, int gain) {
            foreach (var tile in tiles) tile.gameObject.SetActive(false);
            var movers = new List<RectTransform>();
            foreach (var travel in plan.travels) {
                var r = Node("MovingTile", board, new Vector2(150, 150), Position(travel.source));
                var image = r.gameObject.AddComponent<UnityEngine.UI.Image>(); image.sprite = tileFace; image.material = faceMaterial; image.raycastTarget = false;
                var number = Label("Value", r, "", 72, new Vector2(146, 146), Vector2.zero);
                SetTile(image, number, travel.value); ghosts.Add(r.gameObject); movers.Add(r);
            }
            float elapsed = 0;
            while (elapsed < .13f) {
                elapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(elapsed / .13f); t = 1 - Mathf.Pow(1 - t, 3);
                for (int i = 0; i < movers.Count; i++) movers[i].anchoredPosition = Vector2.Lerp(Position(plan.travels[i].source), Position(plan.travels[i].destination), t);
                yield return null;
            }
            ClearGhosts(); RenderBoard();
            gainText.text = gain > 0 ? "+" + gain.ToString("N0", ScoreCulture) : "";
            elapsed = 0;
            while (elapsed < .16f) {
                elapsed += Time.unscaledDeltaTime; float t = Mathf.Clamp01(elapsed / .16f);
                for (int i = 0; i < 16; i++) {
                    float scale = plan.spawned[i] ? Mathf.Lerp(.65f, 1, 1 - Mathf.Pow(1 - t, 3)) : plan.merged[i] ? 1 + .10f * Mathf.Sin(t * Mathf.PI) : 1;
                    tiles[i].rectTransform.localScale = Vector3.one * scale;
                }
                scoreText.rectTransform.localScale = Vector3.one * (1 + (gain > 0 ? .04f * Mathf.Sin(t * Mathf.PI) : 0));
                gainText.rectTransform.anchoredPosition = new Vector2(0, 222 + t * 18);
                gainText.alpha = 1 - t;
                yield return null;
            }
            ResetEffects(); motion = null;
        }
        void ClearGhosts() { foreach (var g in ghosts) { g.SetActive(false); Destroy(g); } ghosts.Clear(); }
        void ResetEffects() {
            foreach (var t in tiles) if (t != null) t.rectTransform.localScale = Vector3.one;
            if (scoreText != null) scoreText.rectTransform.localScale = Vector3.one;
            if (gainText != null) { gainText.text = ""; gainText.alpha = 1; }
        }
        void StopMotion() { if (motion != null) StopCoroutine(motion); motion = null; ClearGhosts(); ResetEffects(); }
        void OnDestroy() { StopMotion(); if (canvasRoot != null) Destroy(canvasRoot); if (ownedEventSystem != null) Destroy(ownedEventSystem); }
        public static Color TileColor(int n) => n switch {
            0 => new Color(.87f, .89f, .85f), 2 => new Color(.87f, .94f, .87f), 4 => new Color(.67f, .86f, .73f),
            8 => new Color(.23f, .50f, .43f), 16 => new Color(.15f, .43f, .39f), 32 => new Color(.17f, .36f, .38f),
            64 => new Color(.22f, .31f, .38f), 128 => new Color(.95f, .80f, .44f), 256 => new Color(.96f, .72f, .38f),
            512 => new Color(.95f, .64f, .39f), 1024 => new Color(.94f, .55f, .43f), _ => new Color(.90f, .66f, .78f) };
        RectTransform Node(string name, Transform parent, Vector2 size, Vector2 position) {
            var g = new GameObject(name, typeof(RectTransform)); var r = g.GetComponent<RectTransform>(); r.SetParent(parent, false);
            r.anchorMin = r.anchorMax = new Vector2(.5f, .5f); r.sizeDelta = size; r.anchoredPosition = position; return r;
        }
        TextMeshProUGUI Label(string name, Transform parent, string value, int size, Vector2 dimensions, Vector2 position) {
            var t = Node(name, parent, dimensions, position).gameObject.AddComponent<TextMeshProUGUI>();
            t.font = font; t.text = value; t.fontSize = size; t.alignment = TextAlignmentOptions.Center;
            t.color = Ink; t.raycastTarget = false; return t;
        }
        void CreateUI() {
            font = Resources.Load<TMP_FontAsset>("UI/Inter-Score"); tileFace = Resources.Load<Sprite>("Gpt/tile-face-v3");
            faceMaterial = Resources.Load<Material>("UI/RoundedArtwork");
            canvasRoot = new GameObject("PuzzleCanvas", typeof(Canvas), typeof(UnityEngine.UI.CanvasScaler), typeof(UnityEngine.UI.GraphicRaycaster));
            canvasRoot.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasRoot.GetComponent<UnityEngine.UI.CanvasScaler>();
            scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(800, 1000); scaler.screenMatchMode = UnityEngine.UI.CanvasScaler.ScreenMatchMode.Expand;
            var bg = Node("Background", canvasRoot.transform, Vector2.zero, Vector2.zero).gameObject.AddComponent<UnityEngine.UI.Image>();
            bg.sprite = Resources.Load<Sprite>("Gpt/background-v2"); bg.color = Color.white; bg.raycastTarget = false;
            bg.rectTransform.anchorMin = Vector2.zero; bg.rectTransform.anchorMax = Vector2.one;
            var content = Node("Gameplay", canvasRoot.transform, new Vector2(800, 1000), Vector2.zero);
            var caption = Label("ScoreLabel", content, "PUNTAJE", 22, new Vector2(680, 40), new Vector2(0, 374)); caption.characterSpacing = 7;
            scoreText = Label("Score", content, "0", 82, new Vector2(680, 105), new Vector2(0, 303));
            gainText = Label("ScoreGain", content, "", 27, new Vector2(680, 40), new Vector2(0, 222)); gainText.color = new Color(.23f, .53f, .45f);
            board = Node("Board", content, new Vector2(684, 684), new Vector2(0, -120));
            var bi = board.gameObject.AddComponent<UnityEngine.UI.Image>(); bi.sprite = tileFace; bi.material = faceMaterial; bi.color = new Color(.18f, .28f, .28f);
            board.gameObject.AddComponent<BoardSwipe>().client = this;
            for (int i = 0; i < 16; i++) {
                var slot = Node("Slot" + i, board, new Vector2(150, 150), Position(i)).gameObject.AddComponent<UnityEngine.UI.Image>();
                slot.sprite = tileFace; slot.material = faceMaterial; slot.color = TileColor(0); slot.raycastTarget = false;
            }
            for (int i = 0; i < 16; i++) {
                var r = Node("Cell" + i, board, new Vector2(150, 150), Position(i));
                tiles[i] = r.gameObject.AddComponent<UnityEngine.UI.Image>(); tiles[i].sprite = tileFace; tiles[i].material = faceMaterial; tiles[i].raycastTarget = false;
                numbers[i] = Label("Value", r, "", 72, new Vector2(146, 146), Vector2.zero);
            }
            if (FindFirstObjectByType<EventSystem>() == null) {
                ownedEventSystem = new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
                ownedEventSystem.GetComponent<InputSystemUIInputModule>().AssignDefaultActions();
            }
        }
    }
    public sealed class BoardSwipe : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IBeginDragHandler, IDragHandler, IEndDragHandler {
        public PuzzleClient client;
        Vector2 start; int? pointer;
        public void OnPointerDown(PointerEventData e) {
            if (pointer.HasValue || e.button != PointerEventData.InputButton.Left) return;
            pointer = e.pointerId; start = e.position;
        }
        public void OnBeginDrag(PointerEventData e) { }
        public void OnDrag(PointerEventData e) { }
        public void OnPointerUp(PointerEventData e) { Complete(e); }
        public void OnEndDrag(PointerEventData e) { Complete(e); }
        void OnDisable() { pointer = null; }
        void Complete(PointerEventData e) {
            if (pointer != e.pointerId) return; pointer = null;
            var delta = e.position - start;
            float threshold = 28 * GetComponentInParent<Canvas>().scaleFactor;
            if (delta.magnitude < threshold) return;
            client.RequestDirection(Mathf.Abs(delta.x) > Mathf.Abs(delta.y) ? (delta.x > 0 ? "right" : "left") : (delta.y > 0 ? "up" : "down"));
        }
    }
}
