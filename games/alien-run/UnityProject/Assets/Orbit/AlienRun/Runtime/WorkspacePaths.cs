using System;
using System.IO;
using UnityEngine;

namespace Orbit.AlienRun
{
    // Used by authoring tools/tests, never by the WebGL game loop.
    public static class WorkspacePaths
    {
        public static string ResolveRoot(string assetsPath)
        {
            var directory = new DirectoryInfo(Path.GetFullPath(assetsPath));
            while (directory != null)
            {
                if (File.Exists(Path.Combine(directory.FullName, "package.json")) &&
                    File.Exists(Path.Combine(directory.FullName, "AGENTS.md")))
                    return directory.FullName;
                directory = directory.Parent;
            }
            throw new DirectoryNotFoundException("Open Alien Run from the Torneos workspace.");
        }

        static string FileIn(string directory, string name)
        {
            if (string.IsNullOrWhiteSpace(name) || Path.GetFileName(name) != name ||
                name.Contains("/") || name.Contains("\\") || name == "." || name == "..")
                throw new ArgumentException("Expected a file name within the workspace.", nameof(name));
            Directory.CreateDirectory(directory);
            return Path.Combine(directory, name);
        }

        public static string Evidence(string name) =>
            FileIn(Path.Combine(ResolveRoot(Application.dataPath), "artifacts", "alien-run"), name);

        public static string Documentation(string name) =>
            FileIn(Path.Combine(ResolveRoot(Application.dataPath), "games", "alien-run", "docs"), name);
    }
}
