using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;

namespace Torneos.FactoryEmpire3D.Domain
{
    [Serializable] public sealed class AchievementDefinition
    {
        public string id, name, description, category, metric, familyId, target, title;
        public bool campaignOnly;
    }
    [Serializable] public sealed class AchievementCatalog
    {
        public string version;
        public AchievementDefinition[] achievements;
        public void Validate(Rules rules)
        {
            if (version != "achievements-1" || achievements == null || achievements.Length < 1 || achievements.Length > 30)
                throw new FormatException("Catálogo de logros incompatible.");
            var ids = new HashSet<string>();
            foreach (var a in achievements) {
                if (a == null || string.IsNullOrWhiteSpace(a.id) || !ids.Add(a.id) || string.IsNullOrWhiteSpace(a.name) || string.IsNullOrWhiteSpace(a.description) || string.IsNullOrWhiteSpace(a.category) || string.IsNullOrWhiteSpace(a.title))
                    throw new FormatException("Logro inválido o repetido.");
                if (!new[] { "historical", "extractors", "owned", "max-level", "sectors", "technologies", "global-technologies", "supported-extractors", "prestiges", "cores" }.Contains(a.metric))
                    throw new FormatException("Métrica de logro desconocida.");
                if (MineralAmount.Parse(a.target, rules.maxAmountDigits).Milli <= 0) throw new FormatException("Objetivo de logro inválido.");
                if (a.metric == "owned" && !rules.buildings.Any(b => b.id == a.familyId)) throw new FormatException("Familia de logro desconocida.");
                if (a.metric != "owned" && !string.IsNullOrEmpty(a.familyId)) throw new FormatException("Familia inesperada en logro.");
            }
        }
    }
    public readonly struct AchievementProgress
    {
        public AchievementDefinition Definition { get; }
        public BigInteger Current { get; }
        public BigInteger Target { get; }
        public bool Unlocked => Current >= Target;
        public float Fraction => (float)(int)(BigInteger.Min(Current, Target) * 1000 / Target) / 1000f;
        public AchievementProgress(AchievementDefinition definition, BigInteger current, bool earned = false)
        {
            Definition = definition; Target = MineralAmount.Parse(definition.target).Milli; Current = earned ? BigInteger.Max(current, Target) : current;
        }
        public string Display()
        {
            var current = BigInteger.Min(Current, Target);
            return Definition.metric == "historical" ? new MineralAmount(current).Display() + " / " + new MineralAmount(Target).Display() + " ferrita" : current + " / " + Target;
        }
    }
    public static class ColonyAchievements
    {
        // Prestige captures earned IDs before resetting industry; completed distinctions
        // therefore survive even when their current-cycle metric falls back to zero.
        public static AchievementProgress[] Evaluate(Colony colony, AchievementCatalog catalog)
        {
            var state = colony.State;
            var extractors = state.structures.Where(b => colony.Rules.Definition(b.definitionId).rateMilli > 0).ToArray();
            var metrics = new Dictionary<string, BigInteger> {
                ["historical"] = MineralAmount.Parse(state.historical, colony.Rules.maxAmountDigits).Milli,
                ["extractors"] = extractors.Length,
                ["max-level"] = extractors.Length == 0 ? 0 : extractors.Max(b => b.level),
                ["sectors"] = state.sectors.Count,
                ["technologies"] = state.technologies.Count,
                ["global-technologies"] = state.technologies.Count(id => string.IsNullOrEmpty(colony.Rules.Technology(id).familyId)),
                ["supported-extractors"] = extractors.Count(b => colony.SupportBonus(b.definitionId,b.cellX,b.cellZ,b.orientation)>0),
                ["prestiges"] = state.prestigeCount,
                ["cores"] = MineralAmount.Parse(state.coresAwarded ?? "0").Milli
            };
            var owned = state.structures.GroupBy(b => b.definitionId).ToDictionary(g => g.Key, g => g.Count());
            return catalog.achievements.Where(a => state.mode != "normalized-challenge" || !a.campaignOnly).Select(a => new AchievementProgress(a, a.metric == "owned" ? (owned.TryGetValue(a.familyId, out int n) ? n : 0) : metrics[a.metric], state.earnedAchievements.Contains(a.id))).ToArray();
        }
        public static string Distinction(AchievementProgress[] progress)
            => progress.LastOrDefault(p => p.Unlocked).Definition?.title ?? "Colonia emergente";
    }
}
