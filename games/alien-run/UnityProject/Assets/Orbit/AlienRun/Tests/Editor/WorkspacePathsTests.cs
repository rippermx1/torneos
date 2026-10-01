using System;
using System.IO;
using NUnit.Framework;
using UnityEngine;

namespace Orbit.AlienRun.Tests
{
    public sealed class WorkspacePathsTests
    {
        [Test] public void EvidenceAndDocumentationStayInsideCurrentWorkspace()
        {
            var root = WorkspacePaths.ResolveRoot(Application.dataPath);
            Assert.That(WorkspacePaths.Evidence("probe.json"), Is.EqualTo(Path.Combine(root, "artifacts", "alien-run", "probe.json")));
            Assert.That(WorkspacePaths.Documentation("probe.csv"), Is.EqualTo(Path.Combine(root, "games", "alien-run", "docs", "probe.csv")));
        }

        [TestCase("../outside.json")]
        [TestCase("..\\outside.json")]
        [TestCase("C:/play-games/evidence/outside.json")]
        public void RejectsPathsOutsideEvidenceDirectory(string name)
        {
            Assert.Throws<ArgumentException>(() => WorkspacePaths.Evidence(name));
        }

        [Test] public void ResolvesWorkspaceIndependentlyOfCurrentWorkingDirectory()
        {
            var before = Directory.GetCurrentDirectory();
            var expected = WorkspacePaths.ResolveRoot(Application.dataPath);
            try {
                Directory.SetCurrentDirectory(Path.GetTempPath());
                Assert.That(WorkspacePaths.ResolveRoot(Application.dataPath), Is.EqualTo(expected));
            } finally { Directory.SetCurrentDirectory(before); }
        }
    }
}
