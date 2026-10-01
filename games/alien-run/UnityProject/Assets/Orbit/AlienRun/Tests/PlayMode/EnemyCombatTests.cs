using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
#if UNITY_EDITOR
using UnityEditor.SceneManagement;
#endif
using Object=UnityEngine.Object;

namespace Orbit.AlienRun.Tests
{
    public sealed class EnemyCombatTests
    {
        private RunSession session;
        private readonly List<GameObject> temporary=new List<GameObject>();
        [UnitySetUp]public IEnumerator Load()
        {
#if UNITY_EDITOR
            EditorSceneManager.LoadSceneInPlayMode("Assets/Orbit/AlienRun/LocalArt/AlienRunProductLevelV8.unity",new LoadSceneParameters(LoadSceneMode.Single));
#endif
            yield return null;session=Object.FindFirstObjectByType<RunSession>();
            // A flat arena isolates body/attack tests from the five authored level sections.
            var floor=new GameObject("Combat_Test_Floor");temporary.Add(floor);floor.transform.position=new Vector3(-60,-.5f,0);
            floor.AddComponent<BoxCollider>().size=new Vector3(30,1,6);
        }
        [UnityTearDown]public IEnumerator Stop()
        {
            if(session!=null)session.AbortRun();
            foreach(var g in temporary)if(g!=null)Object.Destroy(g);temporary.Clear();yield return null;
        }
        private IEnumerator Begin()
        {
            session.bridge.StartLocalPractice();while(session.ControlsLocked)yield return null;yield return null;
            session.runner.ResetAt(new Vector3(-72,.98f,0));yield return new WaitForSeconds(.15f);
        }
        private PatrolEnemy Actor(float speed=0)
        {
            var g=new GameObject("Combat_Test_Enemy");temporary.Add(g);g.transform.position=new Vector3(-60,.9f,0);
            var c=g.AddComponent<CapsuleCollider>();c.height=1.8f;c.radius=.35f;c.isTrigger=true;
            var rb=g.AddComponent<Rigidbody>();rb.isKinematic=true;rb.useGravity=false;
            var enemy=g.AddComponent<PatrolEnemy>();enemy.session=session;enemy.leftX=-60;enemy.rightX=-56;enemy.speed=speed;return enemy;
        }
        [UnityTest]public IEnumerator FastPatrolWaitsForEntranceAndStaysInsideAuthoredBounds()
        {
            var enemy=Actor(3.3f);var position=enemy.transform.position;
            yield return new WaitForSeconds(.25f);Assert.That(enemy.transform.position,Is.EqualTo(position));
            session.bridge.StartLocalPractice();yield return new WaitForSeconds(.3f);
            Assert.IsTrue(session.ControlsLocked);Assert.That(enemy.transform.position.x,Is.EqualTo(-60).Within(.01f));
            while(session.ControlsLocked)yield return null;
            session.runner.ResetAt(new Vector3(-72,.98f,0));var start=enemy.transform.position.x;
            yield return new WaitForSeconds(.3f);
            Assert.That(enemy.transform.position.x-start,Is.InRange(.8f,1.25f));
            var until=Time.time+2.5f;var turned=false;
            while(Time.time<until)
            {
                Assert.That(enemy.transform.position.x,Is.InRange(-60.01f,-55.99f));turned|=enemy.Facing<0;yield return null;
            }
            Assert.IsTrue(turned);Assert.That(enemy.transform.position.y,Is.EqualTo(.9f).Within(.01f));Assert.AreEqual(0,session.Deaths);
        }
        [UnityTest]public IEnumerator ContactUsesActualCapsuleAndStompRemainsNonLethal()
        {
            var enemy=Actor();enemy.hitRadius=3f;yield return Begin();
            session.runner.ResetAt(new Vector3(-61.15f,.98f,0));yield return new WaitForSeconds(.2f);
            Assert.AreEqual(0,session.Deaths,"A large legacy hitRadius must not enlarge an authored body collider");
            session.runner.ResetAt(new Vector3(-60,4.1f,0));var until=Time.time+2;
            while(enemy.Alive && Time.time<until)yield return null;
            Assert.IsFalse(enemy.Alive);Assert.AreEqual("Death",enemy.DeathAnimation);Assert.AreEqual(0,session.Deaths);Assert.Greater(session.runner.VerticalSpeed,7);
            Assert.IsFalse(enemy.GetComponent<Collider>().enabled);
            yield return new WaitForSeconds(1.5f);Assert.IsFalse(enemy.gameObject.activeSelf);
            session.AbortRun();yield return Begin();Assert.IsTrue(enemy.Alive);Assert.IsTrue(enemy.GetComponent<Collider>().enabled);
            session.runner.ResetAt(new Vector3(-60.45f,.98f,0));yield return new WaitForSeconds(.1f);
            Assert.AreEqual(1,session.Deaths,"Side contact must hit exactly once");
        }
        [UnityTest]public IEnumerator MeleeTelegraphsLocksDirectionAndResetsAfterDefeat()
        {
            var enemy=Actor();var melee=enemy.gameObject.AddComponent<EnemyMeleeAttack>();melee.session=session;yield return Begin();
            session.runner.ResetAt(new Vector3(-58.55f,.98f,0));var until=Time.time+1.5f;
            while(!melee.WindingUp && Time.time<until)yield return null;
            Assert.IsTrue(melee.WindingUp);Assert.IsTrue(melee.Busy);Assert.AreEqual(0,melee.Swings);Assert.AreEqual(0,session.Deaths);
            Assert.AreEqual(1,enemy.Facing);Assert.IsTrue(enemy.GetComponentInChildren<LineRenderer>().enabled);
            yield return new WaitForSeconds(.15f);Assert.AreEqual(0,melee.Swings,"Warning must precede damage");
            session.runner.ResetAt(new Vector3(-61.45f,.98f,0));yield return new WaitForSeconds(.4f);
            Assert.AreEqual(1,melee.Swings);Assert.AreEqual(0,session.Deaths,"The attack cannot turn after committing");Assert.AreEqual(1,enemy.Facing);
            enemy.Defeat();Assert.IsFalse(melee.Busy);Assert.IsFalse(enemy.GetComponentInChildren<LineRenderer>().enabled);
            yield return new WaitForSeconds(1.5f);session.AbortRun();yield return Begin();Assert.AreEqual(0,melee.Swings);Assert.IsTrue(enemy.Alive);
        }
        [UnityTest]public IEnumerator MeleeStrikeHitsItsReachAndCancelsDuringRespawn()
        {
            var enemy=Actor();var melee=enemy.gameObject.AddComponent<EnemyMeleeAttack>();melee.session=session;yield return Begin();
            session.runner.ResetAt(new Vector3(-58.55f,.98f,0));var until=Time.time+2;
            while(session.Deaths==0 && Time.time<until)yield return null;
            Assert.AreEqual(1,session.Deaths);Assert.AreEqual(1,melee.Swings);
            yield return null;Assert.IsFalse(melee.Busy);Assert.IsFalse(melee.WindingUp);Assert.IsFalse(melee.Striking);
            yield return new WaitForSeconds(.3f);Assert.AreEqual(1,session.Deaths,"Transition protection prevents repeated damage");
        }
        [UnityTest]public IEnumerator RangedAttackWarnsBeforeReleaseAndDoesNotTrackADodge()
        {
            var enemy=Actor();var thrower=enemy.gameObject.AddComponent<EnemyAxeThrower>();thrower.session=session;
            var axeVisual=new GameObject("Combat_Test_Axe_Visual");temporary.Add(axeVisual);thrower.axePrefab=axeVisual;
            yield return Begin();session.runner.ResetAt(new Vector3(-54,.98f,0));var until=Time.time+2;
            while(!thrower.WindingUp && Time.time<until)yield return null;
            Assert.IsTrue(thrower.WindingUp);Assert.AreEqual(0,thrower.Throws);Assert.AreEqual("Throw",enemy.ActionAnimation);
            yield return new WaitForSeconds(.25f);Assert.AreEqual(0,thrower.Throws);
            session.runner.ResetAt(new Vector3(-66,.98f,0));until=Time.time+1;
            while(thrower.Throws==0 && Time.time<until)yield return null;
            Assert.AreEqual(1,thrower.Throws);Assert.IsTrue(thrower.Busy);
            var projectiles=Object.FindObjectsByType<AxeProjectile>(FindObjectsSortMode.None);
            var found=false;foreach(var axe in projectiles)if(axe.hostile && axe.transform.position.x<0){found=true;Assert.Greater(axe.velocity.x,0);}
            Assert.IsTrue(found,"Actual ballistic projectile must keep the warned direction");Assert.AreEqual(0,session.Deaths);
            enemy.Defeat();Assert.IsFalse(thrower.Busy);
        }
        [UnityTest]public IEnumerator SolidCoverBlocksMeleeAndRangedUntilRemoved()
        {
            var enemy=Actor();var melee=enemy.gameObject.AddComponent<EnemyMeleeAttack>();melee.session=session;yield return Begin();
            var cover=new GameObject("Combat_Test_Cover");temporary.Add(cover);cover.transform.position=new Vector3(-59.2f,1.2f,0);
            cover.AddComponent<BoxCollider>().size=new Vector3(.2f,2.4f,2);
            session.runner.ResetAt(new Vector3(-58.55f,.98f,0));Physics.SyncTransforms();
            var until=Time.time+2;
            while(melee.Swings==0 && Time.time<until)yield return null;
            Assert.AreEqual(1,melee.Swings);yield return new WaitForSeconds(.2f);Assert.AreEqual(0,session.Deaths,"Solid cover blocks an overlapping strike volume");
            enemy.Defeat();
            var ranged=Actor();var thrower=ranged.gameObject.AddComponent<EnemyAxeThrower>();thrower.session=session;
            var visual=new GameObject("Combat_Test_Cover_Axe");temporary.Add(visual);thrower.axePrefab=visual;
            yield return new WaitForSeconds(1);Assert.IsFalse(thrower.WindingUp);Assert.AreEqual(0,thrower.Throws);
            Object.Destroy(cover);yield return null;until=Time.time+1.5f;
            while(!thrower.WindingUp && Time.time<until)yield return null;
            Assert.IsTrue(thrower.WindingUp,"The target's own capsule must not be mistaken for cover");
            ranged.Defeat();
        }
    }
}
