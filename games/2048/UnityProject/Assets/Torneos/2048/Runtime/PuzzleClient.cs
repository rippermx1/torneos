using System;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace Torneos.Puzzle2048
{
    [Serializable] public sealed class PuzzleState {
        public int[] cells; public int score,move_number,time_left_seconds=-1;
        public bool locked,game_over,can_restart; public string mode,message;
    }
    public sealed class PuzzleClient : MonoBehaviour
    {
        public const string BuildId="unity-2048-002";
        Text scoreText,statusText,timeText; Image[] tiles=new Image[16]; Text[] numbers=new Text[16];
        Button restart; PuzzleState state; PracticeBoard practice; float nextInput;
        Sprite tileFace; Font font;
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void Torneos2048Event(string json);
#endif
        void Send(string type,string direction=null) {
#if UNITY_WEBGL && !UNITY_EDITOR
            Torneos2048Event(JsonUtility.ToJson(new ClientEvent {type=type,direction=direction,build_id=BuildId}));
#endif
        }
        [Serializable] sealed class ClientEvent { public string channel="torneos.2048"; public int version=1; public string type,direction,build_id; }
        void Start() {
            Application.targetFrameRate=60;
            CreateUI();
#if UNITY_WEBGL && !UNITY_EDITOR
            ApplyState(new PuzzleState{cells=new int[16],locked=true,can_restart=false,message="Conectando con TorneosPlay…"});
            Send("game.ready");
#else
            Restart();
#endif
        }
        public void OnPlatformState(string json) { ApplyState(JsonUtility.FromJson<PuzzleState>(json)); }
        public void ApplyState(PuzzleState value) {
            if(value==null || value.cells==null || value.cells.Length!=16) return;
            state=value;
            for(int i=0;i<16;i++) {
                int n=state.cells[i]; numbers[i].text=n==0?"":n.ToString();
                numbers[i].fontSize=n>=10000?35:n>=1000?43:55;
                tiles[i].color=TileColor(n); numbers[i].color=n>=16?new Color(.98f,.96f,.87f):new Color(.07f,.17f,.19f);
            }
            scoreText.text="PUNTAJE  "+state.score.ToString("N0");
            statusText.text=state.message ?? "";
            timeText.text=state.time_left_seconds>=0?$"{state.time_left_seconds/60:00}:{state.time_left_seconds%60:00}":"PRÁCTICA LIBRE";
            restart.gameObject.SetActive(state.can_restart);
        }
        public void RequestDirection(string direction) {
            if(state==null || state.locked || Time.unscaledTime<nextInput) return;
            nextInput=Time.unscaledTime+.09f;
#if UNITY_WEBGL && !UNITY_EDITOR
            Send("game.input",direction);
#else
            practice.Move(direction); RenderPractice();
#endif
        }
        void Restart() {
#if UNITY_WEBGL && !UNITY_EDITOR
            if(state!=null && state.can_restart) Send("game.restart");
#else
            practice=new PracticeBoard(Environment.TickCount); RenderPractice();
#endif
        }
        void RenderPractice() { ApplyState(new PuzzleState {cells=practice.Cells,score=practice.Score,can_restart=true,locked=!practice.CanMove(),game_over=!practice.CanMove(),mode="practice",message=practice.CanMove()?"Une fichas iguales · flechas, WASD o desliza":"Sin movimientos · juega otra vez"}); }
        void Update() {
            var k=Keyboard.current; if(k==null) return;
            if(k.leftArrowKey.wasPressedThisFrame || k.aKey.wasPressedThisFrame) RequestDirection("left");
            else if(k.rightArrowKey.wasPressedThisFrame || k.dKey.wasPressedThisFrame) RequestDirection("right");
            else if(k.upArrowKey.wasPressedThisFrame || k.wKey.wasPressedThisFrame) RequestDirection("up");
            else if(k.downArrowKey.wasPressedThisFrame || k.sKey.wasPressedThisFrame) RequestDirection("down");
        }
        public static Color TileColor(int n) => n switch {
            0=>new Color(.14f,.26f,.28f,.65f), 2=>new Color(.88f,.86f,.74f), 4=>new Color(.78f,.86f,.74f),
            8=>new Color(.45f,.75f,.64f), 16=>new Color(.20f,.59f,.52f), 32=>new Color(.20f,.46f,.48f),
            64=>new Color(.23f,.37f,.52f), 128=>new Color(.53f,.39f,.23f),256=>new Color(.68f,.40f,.22f),
            512=>new Color(.72f,.30f,.22f),1024=>new Color(.60f,.23f,.33f),_=>new Color(.44f,.25f,.50f) };
        RectTransform Node(string name,Transform parent,Vector2 size,Vector2 position) {
            var g=new GameObject(name,typeof(RectTransform)); var r=g.GetComponent<RectTransform>();r.SetParent(parent,false);
            r.anchorMin=r.anchorMax=new Vector2(.5f,.5f);r.sizeDelta=size;r.anchoredPosition=position;return r;
        }
        Text Label(string name,Transform parent,string value,int size,Vector2 dimensions,Vector2 position,Color? color=null) {
            var t=Node(name,parent,dimensions,position).gameObject.AddComponent<Text>();t.font=font;t.text=value;t.fontSize=size;
            t.alignment=TextAnchor.MiddleCenter;t.color=color??new Color(.95f,.94f,.84f);t.raycastTarget=false;return t;
        }
        Button Control(string name,Transform parent,string label,Vector2 size,Vector2 pos,Action action) {
            var r=Node(name,parent,size,pos);var im=r.gameObject.AddComponent<Image>();im.sprite=tileFace;im.color=new Color(.21f,.38f,.39f);
            var b=r.gameObject.AddComponent<Button>();b.targetGraphic=im;b.onClick.AddListener(()=>action());b.navigation=new Navigation {mode=Navigation.Mode.None};
            Label(name+"Text",r,label,28,size,Vector2.zero);return b;
        }
        void CreateUI() {
            font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); tileFace=Resources.Load<Sprite>("Gpt/tile-face-v1");
            var root=new GameObject("PuzzleCanvas",typeof(Canvas),typeof(CanvasScaler),typeof(GraphicRaycaster));
            var canvas=root.GetComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            var scaler=root.GetComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;scaler.referenceResolution=new Vector2(800,1000);scaler.matchWidthOrHeight=0;
            var bg=Node("GPTBackground",root.transform,new Vector2(800,1000),Vector2.zero).gameObject.AddComponent<Image>();
            bg.sprite=Resources.Load<Sprite>("Gpt/background-v1");bg.color=Color.white;bg.raycastTarget=false;
            var br=bg.rectTransform;br.anchorMin=Vector2.zero;br.anchorMax=Vector2.one;br.sizeDelta=Vector2.zero;
            Label("Title",root.transform,"2048",74,new Vector2(500,90),new Vector2(0,430));
            Label("Brand",root.transform,"TORNEOSPLAY",20,new Vector2(600,36),new Vector2(0,366),new Color(.71f,.76f,.68f));
            scoreText=Label("Score",root.transform,"PUNTAJE  0",31,new Vector2(500,60),new Vector2(0,321));
            timeText=Label("Time",root.transform,"PRÁCTICA LIBRE",20,new Vector2(550,36),new Vector2(0,278));
            var board=Node("Board",root.transform,new Vector2(576,576),new Vector2(0,-137));
            var bi=board.gameObject.AddComponent<Image>();bi.color=new Color(.04f,.14f,.16f,.90f);
            board.gameObject.AddComponent<BoardSwipe>().client=this;
            for(int i=0;i<16;i++) {
                var r=Node("Cell"+i,board,new Vector2(128,128),new Vector2((i%4-1.5f)*140,(1.5f-i/4)*140));
                tiles[i]=r.gameObject.AddComponent<Image>();tiles[i].sprite=tileFace;tiles[i].raycastTarget=false;
                numbers[i]=Label("Value",r,"",55,new Vector2(128,128),Vector2.zero);
            }
            // Compact buttons make pointer play possible without keyboard focus.
            Control("Left",root.transform,"A",new Vector2(100,55),new Vector2(-174,-463),()=>RequestDirection("left"));
            Control("Up",root.transform,"W",new Vector2(100,55),new Vector2(-58,-463),()=>RequestDirection("up"));
            Control("Down",root.transform,"S",new Vector2(100,55),new Vector2(58,-463),()=>RequestDirection("down"));
            Control("Right",root.transform,"D",new Vector2(100,55),new Vector2(174,-463),()=>RequestDirection("right"));
            // Status and restart are placed outside the board; the web host also exposes status accessibly.
            statusText=Label("Status",root.transform,"",20,new Vector2(720,44),new Vector2(0,240));
            restart=Control("Restart",root.transform,"Nueva partida",new Vector2(250,47),new Vector2(0,196),Restart);
            if(FindFirstObjectByType<EventSystem>()==null) {
                var es=new GameObject("EventSystem",typeof(EventSystem),typeof(InputSystemUIInputModule));
                es.GetComponent<InputSystemUIInputModule>().AssignDefaultActions();
            }
        }
    }
    public sealed class BoardSwipe : MonoBehaviour, IPointerDownHandler, IPointerUpHandler {
        public PuzzleClient client;Vector2 start;
        public void OnPointerDown(PointerEventData e) { start=e.position; }
        public void OnPointerUp(PointerEventData e) {
            var d=e.position-start;if(d.magnitude<25) return;
            client.RequestDirection(Mathf.Abs(d.x)>Mathf.Abs(d.y)?(d.x>0?"right":"left"):(d.y>0?"up":"down"));
        }
    }
}
