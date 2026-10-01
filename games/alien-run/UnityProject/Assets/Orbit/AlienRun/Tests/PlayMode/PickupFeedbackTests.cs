using System.Collections;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Orbit.AlienRun.Tests
{
    public sealed class PickupFeedbackTests
    {
        private readonly List<GameObject> pickups = new List<GameObject>();

        private Collectible Pickup(bool star)
        {
            var root = GameObject.CreatePrimitive(star ? PrimitiveType.Cube : PrimitiveType.Cylinder);
            root.name = star ? "FeedbackTestStar" : "FeedbackTestCoin";
            root.transform.position = new Vector3(500f, 50f, 0f);
            root.transform.localScale = Vector3.one * .6f;
            pickups.Add(root);
            var pickup = root.AddComponent<Collectible>();
            pickup.isStar = star;
            pickup.collectibleId = star ? "test-star" : "test-coin";
            return pickup;
        }

        [SetUp]
        public void Before() => PickupFeedback.Clear(null);

        [UnityTearDown]
        public IEnumerator After()
        {
            PickupFeedback.Clear(null);
            foreach (var pickup in pickups) if (pickup != null) Object.Destroy(pickup);
            pickups.Clear();
            yield return null;
        }

        [UnityTest]
        public IEnumerator CollectionImmediatelyDisablesPickupAndAnimatesSeparateNonPhysicalVisual()
        {
            var coin = Pickup(false);
            var sourceMesh = coin.GetComponent<MeshFilter>().sharedMesh;
            var origin = coin.transform.position;
            coin.Collect(null);
            Assert.IsFalse(coin.gameObject.activeSelf);
            Assert.AreEqual(1, PickupFeedback.ActiveCount);
            var effect = Object.FindObjectsByType<PickupFeedback>(FindObjectsSortMode.None).Single();
            Assert.IsFalse(effect.StarEffect);
            Assert.AreEqual(0, effect.GetComponentsInChildren<Collider>().Length);
            Assert.AreEqual(0, effect.GetComponentsInChildren<Rigidbody>().Length);
            Assert.AreEqual(0, effect.GetComponentsInChildren<Collectible>().Length);
            Assert.AreSame(sourceMesh, effect.transform.Find("CollectedVisual/RewardMesh").GetComponent<MeshFilter>().sharedMesh);
            var renderer = effect.transform.Find("CollectedVisual/RewardMesh").GetComponent<Renderer>();
            Assert.AreEqual("Sprites/Default", renderer.sharedMaterial.shader.name);
            Assert.IsTrue(renderer.sharedMaterial.shader.isSupported);
            var properties = new MaterialPropertyBlock();
            renderer.GetPropertyBlock(properties);
            Assert.That(properties.GetColor("_Color").a, Is.EqualTo(1f).Within(.01f));

            yield return new WaitForSeconds(.27f);
            Assert.IsNotNull(effect);
            Assert.Greater(effect.transform.position.y, origin.y + .3f);
            Assert.Greater(Quaternion.Angle(Quaternion.identity, effect.transform.Find("CollectedVisual").localRotation), 15f);
            renderer.GetPropertyBlock(properties);
            Assert.That(properties.GetColor("_Color").a, Is.InRange(.1f, .95f));
            yield return new WaitForSeconds(.7f);
            Assert.AreEqual(0, PickupFeedback.ActiveCount);
            Assert.IsTrue(effect == null);
        }

        [UnityTest]
        public IEnumerator StarsHaveLongerDistinctBurstAndOneSharedMaterial()
        {
            Pickup(false).Collect(null);
            Pickup(true).Collect(null);
            var effects = Object.FindObjectsByType<PickupFeedback>(FindObjectsSortMode.None);
            var coin = effects.Single(x => !x.StarEffect);
            var star = effects.Single(x => x.StarEffect);
            Assert.Greater(star.Duration, coin.Duration);
            var coinBurst = coin.transform.Find("RewardSparkles");
            var starBurst = star.transform.Find("RewardSparkles");
            Assert.Greater(starBurst.GetComponent<MeshFilter>().sharedMesh.vertexCount,
                coinBurst.GetComponent<MeshFilter>().sharedMesh.vertexCount);
            Assert.AreSame(coinBurst.GetComponent<Renderer>().sharedMaterial, starBurst.GetComponent<Renderer>().sharedMaterial);
            yield return new WaitForSeconds(.72f);
            Assert.IsTrue(coin == null);
            Assert.IsTrue(star != null);
            yield return new WaitForSeconds(.35f);
            Assert.AreEqual(0, PickupFeedback.ActiveCount);
        }

        [UnityTest]
        public IEnumerator DensePickupBurstsAreBoundedAndClearImmediatelyOnReset()
        {
            for (var i = 0; i < PickupFeedback.MaximumActive * 2; i++) Pickup(false).Collect(null);
            Assert.AreEqual(PickupFeedback.MaximumActive, PickupFeedback.ActiveCount);
            Assert.AreEqual(PickupFeedback.MaximumActive,
                Object.FindObjectsByType<PickupFeedback>(FindObjectsSortMode.None).Length);
            PickupFeedback.Clear(null);
            Assert.AreEqual(0, PickupFeedback.ActiveCount);
            Assert.AreEqual(0, Object.FindObjectsByType<PickupFeedback>(FindObjectsSortMode.None).Length);
            yield return null;
            Assert.AreEqual(0, Object.FindObjectsByType<PickupFeedback>(FindObjectsInactive.Include, FindObjectsSortMode.None).Length);
        }
    }
}
