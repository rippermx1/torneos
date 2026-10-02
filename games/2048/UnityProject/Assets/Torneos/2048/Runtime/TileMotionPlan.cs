using System.Collections.Generic;

namespace Torneos.Puzzle2048
{
    // Visual correspondence only: authoritative board and score are never changed here.
    public sealed class TileMotionPlan
    {
        public struct Travel { public int source, destination, value; }
        public readonly List<Travel> travels = new List<Travel>();
        public readonly bool[] merged = new bool[16];
        public readonly bool[] spawned = new bool[16];
        public static TileMotionPlan Confirm(int[] before, int[] after, string direction)
        {
            if (direction != "left" && direction != "right" && direction != "up" && direction != "down") return null;
            var plan = new TileMotionPlan(); var expected = new int[16]; bool moved = false;
            for (int line = 0; line < 4; line++) {
                var sources = new List<int>();
                for (int offset = 0; offset < 4; offset++) {
                    int index = Index(direction, line, offset); if (before[index] != 0) sources.Add(index);
                }
                int target = 0;
                for (int n = 0; n < sources.Count; n++) {
                    int source = sources[n], destination = Index(direction, line, target++), value = before[source];
                    plan.travels.Add(new Travel { source = source, destination = destination, value = value });
                    if (n + 1 < sources.Count && before[sources[n + 1]] == value) {
                        plan.travels.Add(new Travel { source = sources[++n], destination = destination, value = value });
                        value *= 2; plan.merged[destination] = true;
                    }
                    expected[destination] = value;
                }
            }
            int spawns = 0;
            for (int i = 0; i < 16; i++) {
                moved |= expected[i] != before[i];
                if (expected[i] == after[i]) continue;
                if (expected[i] != 0 || (after[i] != 2 && after[i] != 4)) return null;
                plan.spawned[i] = true; spawns++;
            }
            return moved && spawns == 1 ? plan : null;
        }
        static int Index(string direction, int line, int offset) => direction switch {
            "right" => line * 4 + 3 - offset, "up" => offset * 4 + line,
            "down" => (3 - offset) * 4 + line, _ => line * 4 + offset };
    }
}
