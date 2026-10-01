using System.Collections;
using UnityEngine;
using UnityEngine.UI;
namespace Orbit.AlienRun
{
    [RequireComponent(typeof(RunSession))]
    public sealed class PlayerTransitions : MonoBehaviour
    {
        public float entryDistance=7.5f;
        public float fadeSeconds=.28f;
        public bool Busy {get;private set;}
        public bool Entering {get;private set;}
        public float FadeAlpha => overlay!=null?overlay.color.a:0f;
        private RunSession session;
        private Image overlay;
        private void Awake()
        {
            session=GetComponent<RunSession>();
            var canvas=new GameObject("RespawnFade",typeof(RectTransform),typeof(Canvas),typeof(GraphicRaycaster));
            canvas.transform.SetParent(transform,false);canvas.GetComponent<Canvas>().renderMode=RenderMode.ScreenSpaceOverlay;
            canvas.GetComponent<Canvas>().sortingOrder=1000;
            var panel=new GameObject("Black",typeof(RectTransform),typeof(Image));panel.transform.SetParent(canvas.transform,false);
            var rect=panel.GetComponent<RectTransform>();rect.anchorMin=Vector2.zero;rect.anchorMax=Vector2.one;rect.offsetMin=rect.offsetMax=Vector2.zero;
            overlay=panel.GetComponent<Image>();Alpha(0);
        }
        private void Alpha(float value){overlay.color=new Color(0,0,0,value);overlay.raycastTarget=Busy;}
        public void Cancel()
        {
            StopAllCoroutines();Busy=Entering=false;
            if(session!=null && session.runner!=null){session.runner.ScriptedMovement=false;session.runner.ScriptedAxis=0;}
            if(overlay!=null)Alpha(0);
        }
        public void BeginEntrance(Vector3 point)
        {
            Cancel();Busy=Entering=true;
            session.runner.ResetAt(session.runner.GroundPosition(point+Vector3.left*entryDistance));
            var camera=Camera.main.GetComponent<FollowCamera>();if(camera!=null)camera.SnapTo(point);
            StartCoroutine(Entrance(point));
        }
        private IEnumerator Entrance(Vector3 point)
        {
            yield return WalkTo(point,3.8f);
            Busy=Entering=false;Alpha(0);session.CompleteEntrance();
        }
        public void DieAndReturn(Vector3 point)
        {
            if(Busy)return;Busy=true;session.runner.Playing=false;
            session.GetComponent<MobileControls>()?.ClearInput();StartCoroutine(Death(point));
        }
        private IEnumerator Fade(float from,float to)
        {
            var age=0f;while(age<fadeSeconds){age+=Time.unscaledDeltaTime;Alpha(Mathf.Lerp(from,to,age/fadeSeconds));yield return null;}Alpha(to);
        }
        private IEnumerator Death(Vector3 point)
        {
            yield return Fade(0,1);
            session.ClearProjectiles();
            session.runner.ResetAt(session.runner.GroundPosition(point+Vector3.left*1.4f));
            var camera=Camera.main.GetComponent<FollowCamera>();if(camera!=null)camera.SnapTo(point);
            yield return new WaitForSecondsRealtime(.12f);
            session.runner.Playing=true;session.runner.ScriptedMovement=true;session.runner.ScriptedAxis=1;
            yield return Fade(1,0);
            yield return WalkTo(point,3.8f);
            Busy=false;Alpha(0);
        }
        private IEnumerator WalkTo(Vector3 point,float speed)
        {
            var motor=session.runner;motor.Playing=true;motor.ScriptedMovement=true;motor.ScriptedAxis=1;motor.ScriptedSpeed=speed;
            var deadline=Time.unscaledTime+3.5f;
            while(motor.transform.position.x<point.x-.05f && Time.unscaledTime<deadline)yield return null;
            motor.ScriptedAxis=0;motor.ScriptedMovement=false;motor.TouchAxis=0;
        }
        private void OnDisable()=>Cancel();
    }
}
