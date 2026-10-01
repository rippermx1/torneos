using System.Collections;
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
#endif
using Object=UnityEngine.Object;

namespace Orbit.AlienRun.Tests
{
    public sealed class EncounterCourseTests
    {
        RunSession session;
        [UnitySetUp]public IEnumerator Load()
        {
#if UNITY_EDITOR
            EditorSceneManager.LoadSceneInPlayMode("Assets/Orbit/AlienRun/LocalArt/AlienRunProductLevelV8.unity",new LoadSceneParameters(LoadSceneMode.Single));
#endif
            yield return null;session=Object.FindFirstObjectByType<RunSession>();
        }
        IEnumerator Begin(){session.bridge.StartLocalPractice();while(session.ControlsLocked)yield return null;yield return null;}
        [UnityTearDown]public IEnumerator Stop(){session.AbortRun();PickupFeedback.Clear(session);yield return null;}
        [UnityTest]public IEnumerator AuthoredActorsPaletteAndHitboxesAreCalibrated()
        {
            var actors=Object.FindObjectsByType<PatrolEnemy>(FindObjectsSortMode.None);
            Assert.AreEqual(9,actors.Length);Assert.AreEqual(5,Object.FindObjectsByType<EnemyAxeThrower>(FindObjectsSortMode.None).Length);
            Assert.AreEqual(4,Object.FindObjectsByType<EnemyMeleeAttack>(FindObjectsSortMode.None).Length);
            Assert.AreEqual(4,Object.FindObjectsByType<SpikeTrap>(FindObjectsSortMode.None).Length);
            Assert.AreEqual(5,Object.FindObjectsByType<MovingHazard>(FindObjectsSortMode.None).Length);
            foreach(var enemy in actors){
                Assert.That(enemy.speed,Is.InRange(2.2f,3.4f));Assert.GreaterOrEqual(enemy.rightX-enemy.leftX,2.8f);
                var body=enemy.GetComponent<Rigidbody>();Assert.IsTrue(body.isKinematic);Assert.IsFalse(body.useGravity);
                var c=enemy.GetComponent<CapsuleCollider>();Assert.IsTrue(c.isTrigger);Assert.AreEqual(1.8f,c.height,.001f);Assert.AreEqual(.36f,c.radius,.001f);
                var feet=float.PositiveInfinity;
                foreach(var skin in enemy.GetComponentsInChildren<SkinnedMeshRenderer>()){
                    var mesh=new Mesh();skin.BakeMesh(mesh);foreach(var v in mesh.vertices)feet=Mathf.Min(feet,skin.transform.TransformPoint(v).y);Object.Destroy(mesh);
                }
                Assert.That(feet,Is.InRange(-.1f,.15f),enemy.name+" visible feet");
                Assert.IsTrue(Physics.Raycast(enemy.transform.position,Vector3.down,out var hit,2,~0,QueryTriggerInteraction.Ignore));
                Assert.That(hit.point.y,Is.EqualTo(0).Within(.03f),enemy.name+" stable patrol floor");
            }
#if UNITY_EDITOR
            const string yellow="Assets/Orbit/AlienRun/LocalArt/GameplayKit/Packs/KayKit - Platformer Pack (for Unity)/Prefabs/yellow/";
            var goldStar=AssetDatabase.LoadAssetAtPath<GameObject>(yellow+"star_yellow.prefab").GetComponent<GameElement>().sourceGuid;
            var goldSpring=AssetDatabase.LoadAssetAtPath<GameObject>(yellow+"spring_pad_yellow.prefab").GetComponent<GameElement>().sourceGuid;
            foreach(var star in session.collectibles.Where(c=>c.isStar))Assert.AreEqual(goldStar,star.GetComponent<GameElement>().sourceGuid,star.name+" yellow provenance");
            foreach(var pad in Object.FindObjectsByType<BouncePad>(FindObjectsSortMode.None))Assert.AreEqual(goldSpring,pad.GetComponent<GameElement>().sourceGuid,pad.name+" yellow provenance");
#endif
            yield return Begin();
            foreach(var shape in Object.FindObjectsByType<Collider>(FindObjectsSortMode.None).Where(c=>c.isTrigger && c.enabled && c.GetComponentInParent<PatrolEnemy>()==null)){
                var bounds=shape.bounds;session.runner.ResetAt(new Vector3(bounds.max.x+.36f+.08f,bounds.center.y,0));Physics.SyncTransforms();
                var controller=session.runner.GetComponent<CharacterController>();
                Assert.IsFalse(Physics.ComputePenetration(shape,shape.transform.position,shape.transform.rotation,controller,controller.transform.position,controller.transform.rotation,out _,out _),shape.name+" must not hit outside its bounds");
            }
            session.runner.ResetAt(session.spawn);
        }
        [UnityTest]public IEnumerator TrapAndPendulumHaveSafeAndActiveWindows()
        {
            yield return Begin();var pendulum=Object.FindFirstObjectByType<PendulumHazard>();pendulum.ResetForRun();
            var before=pendulum.transform.position;yield return new WaitForSeconds(.7f);
            Assert.Greater(Vector3.Distance(before,pendulum.transform.position),.5f);
            Assert.AreEqual(pendulum.length,Vector3.Distance(pendulum.pivot,pendulum.transform.position),.04f);
            Assert.Greater(pendulum.GetComponent<SphereCollider>().bounds.min.y,4.3f,"Bridge can be walked under saw");
            foreach(var trap in Object.FindObjectsByType<SpikeTrap>(FindObjectsSortMode.None)){
                trap.phaseOffset=0;trap.ResetForRun();yield return null;Assert.IsFalse(trap.danger.enabled);
                yield return new WaitForSeconds(trap.period*.62f);Assert.IsTrue(trap.Extended);Assert.IsTrue(trap.danger.enabled);
                var rendererBounds=trap.spikes.GetComponentsInChildren<Renderer>().Select(r=>r.bounds).ToArray();
                var visible=rendererBounds[0];foreach(var b in rendererBounds.Skip(1))visible.Encapsulate(b);
                Assert.LessOrEqual(trap.danger.bounds.max.y,visible.max.y+.02f);Assert.Greater(trap.danger.bounds.max.y,.1f);
                yield return new WaitForSeconds(trap.period*.45f);Assert.IsFalse(trap.danger.enabled);
            }
            Assert.AreEqual(0,session.Deaths);
        }
        [UnityTest]public IEnumerator PickupsShowCoinAndStarCelebrationDuringPhysicalCollection()
        {
            yield return Begin();session.runner.TouchAxis=1;var until=Time.time+2;
            while(PickupFeedback.ActiveCount==0 && Time.time<until)yield return null;
            session.runner.TouchAxis=0;Assert.Greater(PickupFeedback.ActiveCount,0);yield return new WaitForSeconds(.12f);yield return CaptureAfterRender("encounters-coin-feedback");
            Assert.IsTrue(Object.FindObjectsByType<PickupFeedback>(FindObjectsSortMode.None).Any(e=>!e.StarEffect));
            // Focal segment setup: the collection still requires jumping through the star.
            session.runner.ResetAt(new Vector3(20.8f,2.18f,0));yield return new WaitForSeconds(.1f);session.runner.QueueTouchJump();
            var star=session.collectibles.First(c=>c.collectibleId=="s01");until=Time.time+3;
            while(star.gameObject.activeSelf && Time.time<until){session.runner.TouchAxis=Mathf.Clamp((star.transform.position.x-session.runner.transform.position.x)*2,-1,1);yield return null;}
            session.runner.TouchAxis=0;Assert.IsFalse(star.gameObject.activeSelf);yield return new WaitForSeconds(.15f);Capture("encounters-star-feedback");
            Assert.IsTrue(Object.FindObjectsByType<PickupFeedback>(FindObjectsSortMode.None).Any(e=>e.StarEffect));
            session.AbortRun();session.bridge.StartLocalPractice();Assert.AreEqual(0,PickupFeedback.ActiveCount);
        }
        static IEnumerator CaptureAfterRender(string name)
        {
            var camera=Camera.main;
            var previousTarget=camera.targetTexture;
            var previousActive=RenderTexture.active;
            var rt=new RenderTexture(1280,720,24);
            Texture2D image=null;
            try {
                rt.Create();camera.targetTexture=rt;
                // Let URP prepare the new target and static scene before the first feedback capture.
                // Yield frames rather than WaitForEndOfFrame, which is unavailable in batch mode.
                yield return null;yield return null;
                camera.Render();RenderTexture.active=rt;
                image=new Texture2D(1280,720,TextureFormat.RGB24,false);
                image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();
                File.WriteAllBytes(WorkspacePaths.Evidence(name+".png"),image.EncodeToPNG());
            } finally {
                camera.targetTexture=previousTarget;RenderTexture.active=previousActive;
                Object.Destroy(rt);if(image!=null)Object.Destroy(image);
            }
        }
        static void Capture(string name)
        {
            var camera=Camera.main;var rt=new RenderTexture(1280,720,24);camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;
            var image=new Texture2D(1280,720,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();
            File.WriteAllBytes(WorkspacePaths.Evidence(name+".png"),image.EncodeToPNG());camera.targetTexture=null;RenderTexture.active=null;Object.Destroy(rt);Object.Destroy(image);
        }
    }
}
