using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Torneos.FactoryEmpire3D.Domain;

// The project links the original Unity 035 domain files, unchanged. This
// executable only translates test vectors and serializes their native results.
sealed class Vector
{
    public ColonySave source;
    public Intent action;
    public long now;
}

sealed class Intent
{
    public string kind, definitionId, instanceId, technologyId, expectedGain;
    public int x, z, orientation, expectedPrestiges;
}

static class Program
{
    static void Main(string[] args)
    {
        if (args.Length != 3) throw new ArgumentException("Expected rules, vectors and result paths.");
        var json = new JsonSerializerOptions { IncludeFields = true };
        var rules = JsonSerializer.Deserialize<Rules>(File.ReadAllText(args[0]), json);
        var resources = Path.GetDirectoryName(args[0]);
        var challengeRules = JsonSerializer.Deserialize<Rules>(File.ReadAllText(Path.Combine(resources, "factory-3d-rules-challenge.json")), json);
        var achievements = JsonSerializer.Deserialize<AchievementCatalog>(File.ReadAllText(Path.Combine(resources, "factory-3d-achievements.json")), json);
        var vectors = JsonSerializer.Deserialize<Vector[]>(File.ReadAllText(args[1]), json);
        var results = vectors.Select(vector =>
        {
            var colony = Colony.Restore(vector.source.mode == "normalized-challenge" ? challengeRules : rules, vector.source);
            var action = vector.action;
            var costs = colony.Rules.buildings.Select(building => colony.PurchaseCost(building.id).ToString()).ToArray();
            var land = colony.LandCost.ToString();
            var upgrades = colony.State.structures.Select(building => colony.UpgradeCost(building).ToString()).ToArray();
            // Account commands settle elapsed offline time before the action,
            // exactly as the server does; Unity applies its own configured cap.
            var earned = colony.Settle(vector.now, true).ToString();
            bool accepted;
            switch (action.kind)
            {
                case "prestige": accepted = colony.Prestige(action.expectedGain, action.expectedPrestiges, vector.now, achievements) == null; break;
                case "mine": accepted = colony.Mine(vector.now); break;
                case "build": accepted = colony.Build(action.definitionId, action.x, action.z, action.orientation, vector.now) == null; break;
                case "move": accepted = colony.Move(action.instanceId, action.x, action.z, action.orientation, vector.now) == null; break;
                case "upgrade": accepted = colony.Upgrade(action.instanceId, vector.now) == null; break;
                case "expand": accepted = colony.BuySector(action.x, action.z, vector.now) == null; break;
                case "technology": accepted = colony.BuyTechnology(action.technologyId, vector.now) == null; break;
                case "sync": accepted = true; break;
                default: throw new ArgumentException("Unsupported parity action.");
            }
            return new { state = colony.State, rateMilli = colony.Rate.ToString(), offlineEarned = earned, accepted, costs, land, upgrades };
        }).ToArray();
        File.WriteAllText(args[2], JsonSerializer.Serialize(results, json));
    }
}
