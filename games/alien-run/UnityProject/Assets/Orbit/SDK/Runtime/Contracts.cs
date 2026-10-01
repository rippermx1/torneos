using System;
namespace Orbit.SDK
{
    [Serializable]
    public sealed class RunConfig
    {
        public string run_id;
        public string game_id;
        public string build_id;
        public string ruleset_version;
        public string mode;
        public int max_duration_ms;
        public int seed;
        public long expires_at_ms;
    }
    [Serializable]
    public sealed class RunResult
    {
        public string build_id;
        public string ruleset_version;
        public int duration_ms;
        public string[] collected_ids;
        public int deaths;
        public bool finished;
    }
    [Serializable]
    internal sealed class GameMessage
    {
        public string channel = "orbit.arcade";
        public int version = 1;
        public string type;
        public string build_id;
        public string ruleset_version;
        public string run_id;
        public RunResult result;
        public string message;
    }
}
