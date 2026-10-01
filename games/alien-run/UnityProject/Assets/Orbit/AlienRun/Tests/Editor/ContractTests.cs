using NUnit.Framework;
using Orbit.SDK;
using UnityEngine;
using UnityEditor;
namespace Orbit.AlienRun.Tests
{
    public sealed class ContractTests
    {
        [Test] public void ConfigUsesSnakeCaseContract()
        {
            var config = JsonUtility.FromJson<RunConfig>("{\"run_id\":\"test\",\"game_id\":\"alien-run\",\"build_id\":\"" + BuildIdentity.BuildId + "\",\"ruleset_version\":\"" + BuildIdentity.RulesetVersion + "\",\"mode\":\"practice\",\"max_duration_ms\":180000}");
            Assert.AreEqual(BuildIdentity.GameId, config.game_id);
            Assert.AreEqual(BuildIdentity.BuildId, config.build_id);
            Assert.AreEqual(180000, config.max_duration_ms);
        }
        [Test] public void TuningHasUsableJumpDefaults()
        {
            var tuning = ScriptableObject.CreateInstance<RunnerTuning>();
            Assert.Greater(tuning.jumpHeight, 0);
            Assert.Less(tuning.gravity, 0);
            Object.DestroyImmediate(tuning);
        }
        [Test] public void LocalFallPoseDoesNotLoop()
        {
            const string path = "Assets/Orbit/AlienRun/LocalArt/EngineerFallHold.anim";
            var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
            if (clip == null) Assert.Ignore("La variante KayKit local aún no se generó.");
            var loop = new SerializedObject(clip).FindProperty("m_AnimationClipSettings.m_LoopTime");
            Assert.IsNotNull(loop);
            Assert.IsFalse(loop.boolValue);
            var source = AssetDatabase.LoadAssetAtPath<AnimationClip>(
                "Assets/KayKit/Characters/Animations/Animations/Rig_Medium/Movement Basic/Jump_Idle.anim");
            Assert.IsNotNull(source);
            Assert.AreNotSame(source, clip);
            Assert.IsTrue(new SerializedObject(source).FindProperty("m_AnimationClipSettings.m_LoopTime").boolValue);
        }
    }
}
