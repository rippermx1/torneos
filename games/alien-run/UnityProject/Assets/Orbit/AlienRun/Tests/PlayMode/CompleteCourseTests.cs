using System;
using System.IO;
using System.Linq;
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.InputSystem;
using UnityEngine.EventSystems;
#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
#endif
using Object=UnityEngine.Object;
namespace Orbit.AlienRun.Tests
{
    public sealed class CompleteCourseTests
    {
        RunSession s;
        [UnitySetUp]public IEnumerator Load(){
#if UNITY_EDITOR
            EditorSceneManager.LoadSceneInPlayMode("Assets/Orbit/AlienRun/LocalArt/AlienRunProductLevelV8.unity",new LoadSceneParameters(LoadSceneMode.Single));
#endif
            yield return null;s=Object.FindFirstObjectByType<RunSession>();
        }
        IEnumerator Begin(){s.bridge.StartLocalPractice();while(s.ControlsLocked)yield return null;yield return new WaitForSeconds(.15f);}
        [UnityTearDown]public IEnumerator Stop(){s.AbortRun();yield return null;}
        [UnityTest]public IEnumerator IdleIsGroundedAndEntranceDoesNotConsumeClock()
        {
            Assert.That(s.runner.transform.position.y,Is.EqualTo(.98f).Within(.06f));
            var foot=s.runner.transform.position.y-.9f;Assert.That(foot,Is.InRange(.02f,.15f));
            s.bridge.StartLocalPractice();Assert.Less(s.runner.transform.position.x,-7);
            yield return new WaitForSeconds(.5f);Assert.AreEqual(0,s.RunElapsedMs);
            Assert.AreEqual("Walk",s.runner.GetComponentInChildren<VisualSkin>().CurrentAnimationState);
            while(s.ControlsLocked)yield return null;Assert.Less(Mathf.Abs(s.runner.transform.position.x),.2f);Assert.IsTrue(s.runner.Grounded);
            Capture("complete-course-runtime-start");
            var min=float.PositiveInfinity;
            foreach(var r in s.runner.GetComponentsInChildren<SkinnedMeshRenderer>()){
                var mesh=new Mesh();r.BakeMesh(mesh);
                foreach(var v in mesh.vertices)min=Mathf.Min(min,r.transform.TransformPoint(v).y);Object.Destroy(mesh);
            }
            Assert.That(min,Is.InRange(-.05f,.18f),"The visible feet must rest on the floor");
        }
        static void Capture(string name)
        {
            var c=Camera.main;var rt=new RenderTexture(1280,720,24);c.targetTexture=rt;c.Render();RenderTexture.active=rt;
            var image=new Texture2D(1280,720,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();
            File.WriteAllBytes(WorkspacePaths.Evidence(name.Replace("complete-course","encounters-course")+".png"),image.EncodeToPNG());c.targetTexture=null;RenderTexture.active=null;Object.Destroy(rt);Object.Destroy(image);
        }
        [UnityTest]public IEnumerator JumpEnvelopeIsStableAtTwentyAndSixtyStepsPerSecond()
        {
            yield return Begin();var rises=new float[2];var ranges=new float[2];
            foreach(var e in Object.FindObjectsByType<PatrolEnemy>(FindObjectsSortMode.None)){e.enabled=false;if(e.TryGetComponent<EnemyAxeThrower>(out var t))t.enabled=false;if(e.TryGetComponent<EnemyMeleeAttack>(out var m))m.enabled=false;}
            var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.name="Jump envelope test floor";
            floor.transform.position=new Vector3(-50,-.5f,0);floor.transform.localScale=new Vector3(30,1,4);
            try {
                for(var trial=0;trial<2;trial++){
                    Time.captureDeltaTime=trial==0?1f/60f:1f/20f;
                    s.runner.ResetAt(new Vector3(-55,.98f,0));yield return new WaitForSeconds(.2f);
                    s.runner.TouchAxis=1;yield return new WaitForSeconds(.2f);var start=s.runner.transform.position;
                    s.runner.QueueTouchJump();var until=Time.time+2;var flew=false;
                    while(Time.time<until){yield return null;rises[trial]=Mathf.Max(rises[trial],s.runner.transform.position.y-start.y);flew|=!s.runner.Grounded;if(flew&&s.runner.Grounded)break;}
                    ranges[trial]=s.runner.transform.position.x-start.x;s.runner.TouchAxis=0;
                    Assert.That(rises[trial],Is.InRange(2.5f,2.9f));Assert.That(ranges[trial],Is.InRange(5.7f,6.8f));
                }
                Assert.Less(Mathf.Abs(rises[0]-rises[1]),.12f);Assert.Less(Mathf.Abs(ranges[0]-ranges[1]),.4f);
                Debug.Log($"JUMP envelopes: height={rises[0]}/{rises[1]}, range={ranges[0]}/{ranges[1]}");
            }finally{Time.captureDeltaTime=0;s.runner.TouchAxis=0;Object.Destroy(floor);}
        }
        [UnityTest]public IEnumerator ContentProvenanceRotationsAndCollisions()
        {
            Assert.AreEqual(90,s.CollectibleCount);Assert.AreEqual(5,s.StarTotal);Assert.AreEqual(95,s.collectibles.Select(c=>c.collectibleId).Distinct().Count());
            Assert.AreEqual(4,s.checkpointFlags.Length);Assert.AreEqual(5,Object.FindObjectsByType<EnemyAxeThrower>(FindObjectsSortMode.None).Length);
            foreach(var t in Object.FindObjectsByType<Transform>(FindObjectsInactive.Include,FindObjectsSortMode.None))Assert.IsFalse(t.name.StartsWith("Archived_")||t.name=="Back_Ridge"||t.name.StartsWith("FloorRim"),t.name);
            foreach(var r in Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None))foreach(var m in r.sharedMaterials)if(m!=null)Assert.AreNotEqual("Hidden/InternalErrorShader",m.shader.name,r.name);
            foreach(var e in Object.FindObjectsByType<GameElement>(FindObjectsSortMode.None)){
                Assert.IsNotEmpty(e.sourceGuid,e.name);
#if UNITY_EDITOR
                var path=PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(e.gameObject);
                if(path!="")Assert.IsTrue(path.Contains("LocalArt/GameplayKit"),path);
#endif
                if(e.role=="Surface")Assert.IsNotNull(e.GetComponent<BoxCollider>(),e.name);
            }
            foreach(var x in new[]{16.2f,19f,21.8f,218.2f,221f,223.8f}){
                Assert.IsTrue(Physics.Raycast(new Vector3(x,8,0),Vector3.down,out var h,20,~0,QueryTriggerInteraction.Ignore));Assert.GreaterOrEqual(h.point.y,-.1f,"Ramp floor "+x);
            }
            var a=s.collectibles.Select(c=>c.transform.rotation).ToArray();yield return new WaitForSeconds(.2f);
            for(var i=0;i<a.Length;i++)Assert.Greater(Quaternion.Angle(a[i],s.collectibles[i].transform.rotation),5);
        }
        [UnityTest]public IEnumerator SupplyHitFromBelowAndBallisticAxeDefeatsAnimatedEnemy()
        {
            yield return Begin();var crate=GameObject.Find("Supply_Axes_8").GetComponent<BreakableBlock>();
            s.runner.ResetAt(new Vector3(8,.98f,0));yield return new WaitForSeconds(.2f);s.runner.QueueTouchJump();yield return new WaitForSeconds(.7f);
            Assert.IsTrue(crate.IsBroken);var w=s.runner.GetComponent<AxeWeapon>();Assert.AreEqual(8,w.Ammo);
            var enemy=Object.FindObjectsByType<PatrolEnemy>(FindObjectsSortMode.None).OrderBy(p=>p.leftX).First();
            // Physical shot from a reachable ground position; enemy remains on its authored patrol.
            s.runner.ResetAt(new Vector3(enemy.leftX-8,.98f,0));yield return new WaitForSeconds(.2f);
            s.runner.TouchAxis=.01f;yield return null;Assert.IsTrue(w.TryThrow());s.runner.TouchAxis=0;
            var axe=Object.FindObjectsByType<AxeProjectile>(FindObjectsSortMode.None).First(p=>!p.hostile);var vy=axe.velocity.y;var rot=axe.visual.rotation;
            yield return new WaitForSeconds(.15f);Assert.Less(axe.velocity.y,vy);Assert.Greater(Quaternion.Angle(rot,axe.visual.rotation),10);
            var until=Time.time+1.5f;while(enemy.Alive && Time.time<until)yield return null;
            Assert.IsFalse(enemy.Alive);Assert.IsTrue(enemy.gameObject.activeSelf,"Keep the death animation visible");Assert.AreEqual("Death",enemy.DeathAnimation);
            Assert.IsTrue(enemy.GetComponentsInChildren<Collider>().All(c=>!c.enabled));yield return new WaitForSeconds(1.5f);Assert.IsFalse(enemy.gameObject.activeSelf);
            s.AbortRun();s.bridge.StartLocalPractice();while(s.ControlsLocked)yield return null;Assert.IsTrue(enemy.Alive);Assert.IsTrue(enemy.gameObject.activeSelf);Assert.IsFalse(crate.IsBroken);Assert.AreEqual(0,w.Ammo);
        }
        [UnityTest]public IEnumerator StompDefeatsWalkerAndBouncesPlayer()
        {
            yield return Begin();var enemy=Object.FindObjectsByType<PatrolEnemy>(FindObjectsSortMode.None).First(e=>e.GetComponent<EnemyAxeThrower>()==null);
            enemy.speed=0;s.runner.ResetAt(enemy.transform.position+Vector3.up*3.2f);var until=Time.time+2;
            while(enemy.Alive && Time.time<until)yield return null;
            Assert.IsFalse(enemy.Alive);Assert.Greater(s.runner.VerticalSpeed,7);Assert.AreEqual(0,s.Deaths);
        }
        [UnityTest]public IEnumerator SpringsCompressAndAllFiveStarRoutesAreReachable()
        {
            yield return Begin();
            foreach(var pad in Object.FindObjectsByType<BouncePad>(FindObjectsSortMode.None)){
                var scale=pad.visual.localScale;s.runner.ResetAt(pad.transform.position+Vector3.up*1.3f);var until=Time.time+2;
                while(pad.BounceCount==0 && Time.time<until)yield return null;Assert.Greater(pad.BounceCount,0);Assert.Greater(s.runner.VerticalSpeed,11);
                yield return new WaitForSeconds(.1f);Assert.Less(pad.visual.localScale.y,scale.y*.95f);
            }
            // Segment setups are explicit. Collection itself must use a real jump or spring flight.
            var starts=new[]{new Vector3(20.8f,2.1f,0),new Vector3(56.2f,3.38f,0),new Vector3(133.6f,1.88f,0),new Vector3(166,1.58f,0),new Vector3(228,4.08f,0)};
            for(var i=0;i<5;i++){
                var star=s.collectibles.First(c=>c.collectibleId=="s"+(i+1).ToString("00"));
                if(i==3){var ferry=Object.FindFirstObjectByType<MovingPlatform>();s.runner.ResetAt(ferry.transform.position+Vector3.up*.98f);}else s.runner.ResetAt(starts[i]);
                if(i!=4){yield return new WaitForSeconds(.2f);s.runner.QueueTouchJump();}var until=Time.time+3;
                while(star.gameObject.activeSelf && Time.time<until && !s.ControlsLocked){var dx=star.transform.position.x-s.runner.transform.position.x;s.runner.TouchAxis=Mathf.Abs(dx)>.5f?Mathf.Sign(dx):0;yield return null;}
                Assert.IsFalse(star.gameObject.activeSelf,$"Star {i+1}: {s.runner.transform.position}");s.runner.TouchAxis=0;
            }
            Assert.AreEqual(0,s.Deaths);Assert.AreEqual(5,s.StarCount);
        }
        [UnityTest]public IEnumerator MovingPlatformCarriesPlayerAndHazardsRespectTheirPhase()
        {
            yield return Begin();var ferry=Object.FindFirstObjectByType<MovingPlatform>();s.runner.ResetAt(ferry.transform.position+Vector3.up*.98f);
            yield return new WaitForSeconds(.2f);var dx=s.runner.transform.position.x-ferry.transform.position.x;
            yield return new WaitForSeconds(.8f);Assert.Less(Mathf.Abs(s.runner.transform.position.x-ferry.transform.position.x-dx),.35f);Assert.IsTrue(s.runner.Grounded);Assert.AreEqual(0,s.Deaths);
            var trap=Object.FindFirstObjectByType<SpikeTrap>();trap.ResetForRun();yield return null;Assert.IsFalse(trap.Extended);
            yield return new WaitForSeconds(2.3f);Assert.IsTrue(trap.Extended);
            var crusher=Object.FindObjectsByType<MovingHazard>(FindObjectsSortMode.None).First(h=>h.name=="Crusher_Blue");
            s.runner.ResetAt(crusher.transform.position);Physics.SyncTransforms();yield return new WaitForSeconds(.1f);Assert.AreEqual(1,s.Deaths);
        }
        [UnityTest]public IEnumerator CheckpointFadeAndCameraRecovery()
        {
            yield return Begin();var flag=s.checkpointFlags[1];s.runner.ResetAt(flag.respawnPoint);yield return new WaitForSeconds(.2f);Assert.IsTrue(flag.IsActive);Assert.AreEqual(2,s.ActiveCheckpoint);
            s.Respawn();s.Respawn();Assert.AreEqual(1,s.Deaths);yield return new WaitForSeconds(.15f);Assert.Greater(s.GetComponent<PlayerTransitions>().FadeAlpha,.2f);
            var black=false;while(s.ControlsLocked){black|=s.GetComponent<PlayerTransitions>().FadeAlpha>.95f;yield return null;}
            Assert.IsTrue(black);Assert.Less(Vector3.Distance(s.runner.transform.position,flag.respawnPoint),.3f);
            var camera=Camera.main;var follow=camera.GetComponent<FollowCamera>();follow.SnapTo(new Vector3(90,1,0));var y=camera.transform.position.y;
            s.runner.ResetAt(new Vector3(90,-5,0));s.runner.Playing=false;yield return new WaitForSeconds(.4f);Assert.GreaterOrEqual(camera.transform.position.y,y-.01f);
        }
        [UnityTest]public IEnumerator MobileAttackUsesOneAxePerPress()
        {
            var device=Touchscreen.current==null?InputSystem.AddDevice<Touchscreen>():null;
            try{
                yield return Begin();var w=s.runner.GetComponent<AxeWeapon>();w.Grant(8);yield return null;
                var controls=s.GetComponent<MobileControls>();var attack=controls.GetComponentsInChildren<TouchHoldButton>().First(b=>b.name=="ThrowAxe");
                ExecuteEvents.Execute(attack.gameObject,new PointerEventData(EventSystem.current){pointerId=5},ExecuteEvents.pointerDownHandler);
                yield return new WaitForSeconds(.65f);Assert.AreEqual(7,w.Ammo);controls.ClearInput();Assert.IsFalse(attack.IsPressed);
            }finally{if(device!=null)InputSystem.RemoveDevice(device);}
        }
        [UnityTest,Timeout(300000)]public IEnumerator FullCourseTwiceUsingPhysicalInputs()
        {
            for(var i=0;i<2;i++){
                yield return Begin();var guide=s.GetComponent<PracticeNavigator>();var until=Time.realtimeSinceStartup+110;var nextLog=Time.time+5;var deaths=0;
                while(s.State==RunState.Playing && Time.realtimeSinceStartup<until){
                    if(!s.ControlsLocked)guide.Drive();
                    if(s.Deaths!=deaths){Debug.Log("COURSE DEATH "+s.runner.transform.position);deaths=s.Deaths;Assert.AreEqual(0,s.Deaths,"Physical route must finish without falls");}
                    if(Time.time>nextLog){Debug.Log($"COURSE {i}: {s.runner.transform.position} coins={s.CollectedCount} ammo={s.runner.GetComponent<AxeWeapon>().Ammo} deaths={s.Deaths}");nextLog=Time.time+5;}
                    yield return null;
                }
                Assert.AreEqual(RunState.Finished,s.State,$"Run {i}: {s.runner.transform.position}; deaths={s.Deaths}");Assert.AreEqual(0,s.Deaths);Assert.GreaterOrEqual(s.CollectedCount,24);Assert.AreEqual(4,s.ActiveCheckpoint);
                Debug.Log($"COURSE FINISHED {i}: coins={s.CollectedCount} stars={s.StarCount} duration={s.RunElapsedMs} deaths={s.Deaths}");
            }
        }
        [UnityTest,Timeout(150000)]public IEnumerator AllFiveStarsInOneContinuousPhysicalRun()
        {
            yield return Begin();var guide=s.GetComponent<PracticeNavigator>();guide.seekStars=true;
            var until=Time.realtimeSinceStartup+110;var nextLog=Time.time+5;var captured=false;
            while(s.State==RunState.Playing && Time.realtimeSinceStartup<until){
                if(!s.ControlsLocked)guide.Drive();Assert.AreEqual(0,s.Deaths,"Star route must avoid falling at "+s.runner.transform.position);
                if(!captured && s.runner.transform.position.x>230 && s.runner.transform.position.y>6){Capture("complete-course-high-spring");captured=true;}
                if(Time.time>nextLog){Debug.Log($"STARS ROUTE {s.runner.transform.position} stars={s.StarCount} coins={s.CollectedCount}");nextLog=Time.time+5;}
                yield return null;
            }
            Assert.AreEqual(RunState.Finished,s.State,$"Stars stopped at {s.runner.transform.position}");Assert.AreEqual(5,s.StarCount);Assert.AreEqual(4,s.ActiveCheckpoint);
            Debug.Log($"ALL STARS FINISHED coins={s.CollectedCount} duration={s.RunElapsedMs}");
        }
    }
}
