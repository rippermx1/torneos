using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;
namespace Orbit.AlienRun.Editor
{
    public static class WebBuild
    {
        [MenuItem("Orbit/Alien Run/Build WebGL Development")]
        public static void BuildDevelopment()
        {
            if (!File.Exists(GreyboxBuilder.ScenePath)) GreyboxBuilder.CreateScene();
            BuildScene(GreyboxBuilder.ScenePath, "Builds/WebGL/greybox-010");
        }

        [MenuItem("Orbit/Alien Run/Build Local Engineer Pilot")]
        public static void BuildKayKitPilot()
        {
            if (!File.Exists(KayKitPilotBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero la variante local Engineer.", KayKitPilotBuilder.ScenePath);
            BuildScene(KayKitPilotBuilder.ScenePath, "Builds/WebGL/kaykit-motion-001");
        }

        [MenuItem("Orbit/Alien Run/Build Local KayKit Stage Pilot")]
        public static void BuildKayKitStagePilot()
        {
            if (!File.Exists(KayKitStageBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero la variante local de escenario KayKit.", KayKitStageBuilder.ScenePath);
            BuildScene(KayKitStageBuilder.ScenePath, "Builds/WebGL/kaykit-stage-001");
        }

        [MenuItem("Orbit/Alien Run/Build Local Polished Stage")]
        public static void BuildKayKitPolishedStage()
        {
            if (!File.Exists(KayKitPolishBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero la variante local pulida.", KayKitPolishBuilder.ScenePath);
            BuildScene(KayKitPolishBuilder.ScenePath, "Builds/WebGL/kaykit-polish-001");
        }

        [MenuItem("Orbit/Alien Run/Build Local Environment Stage")]
        public static void BuildKayKitEnvironmentStage()
        {
            if (!File.Exists(KayKitEnvironmentBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero la variante local de ambiente.", KayKitEnvironmentBuilder.ScenePath);
            BuildScene(KayKitEnvironmentBuilder.ScenePath, "Builds/WebGL/kaykit-environment-001");
        }

        [MenuItem("Orbit/Alien Run/Build Local Level One")]
        public static void BuildLevelOne()
        {
            if (!File.Exists(LevelOneBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero el nivel local.", LevelOneBuilder.ScenePath);
            BuildScene(LevelOneBuilder.ScenePath, "Builds/WebGL/level-one-001");
        }

        [MenuItem("Orbit/Alien Run/Build Local Level Design")]
        public static void BuildLevelDesign()
        {
            if (!File.Exists(LevelDesignBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero la variante de diseño de nivel.", LevelDesignBuilder.ScenePath);
            BuildScene(LevelDesignBuilder.ScenePath, "Builds/WebGL/level-design-001");
        }

        [MenuItem("Orbit/Alien Run/Build Local KayKit Section")]
        public static void BuildKayKitSection()
        {
            if (!File.Exists(KayKitSectionBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero la sección KayKit.", KayKitSectionBuilder.ScenePath);
            BuildScene(KayKitSectionBuilder.ScenePath, "Builds/WebGL/kaykit-section-001");
        }

        [MenuItem("Orbit/Alien Run/Build Local Product Level")]
        public static void BuildProductLevel()
        {
            if (!File.Exists(LevelPlayBuilder.ScenePath))
                throw new FileNotFoundException("Crea primero el nivel KayKit local.", LevelPlayBuilder.ScenePath);
            BuildScene(LevelPlayBuilder.ScenePath, "Builds/WebGL/product-level-001");
        }

        private static void BuildScene(string scenePath, string defaultOutput)
        {
            if (SystemInfo.graphicsDeviceType == UnityEngine.Rendering.GraphicsDeviceType.Null)
                throw new InvalidOperationException("WebGL requiere un dispositivo gráfico al compilar; ejecuta Unity sin -nographics.");
            var output = Environment.GetEnvironmentVariable("ORBIT_WEBGL_OUTPUT");
            if (string.IsNullOrWhiteSpace(output)) output = defaultOutput;
            PlayerSettings.companyName = "Orbit Arcade";
            PlayerSettings.productName = "Alien Run";
            PlayerSettings.WebGL.template = "PROJECT:Orbit";
            // Deliberately uncompressed first build. Configure production Brotli only with matching server headers.
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = new[] { scenePath }, locationPathName = output,
                target = BuildTarget.WebGL, options = BuildOptions.Development
            });
            if (report.summary.result != BuildResult.Succeeded)
                throw new InvalidOperationException("WebGL build failed: " + report.summary.result);
            Debug.Log("WebGL build created at " + Path.GetFullPath(output));
        }
    }
}
