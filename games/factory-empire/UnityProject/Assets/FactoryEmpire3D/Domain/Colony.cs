using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Numerics;

namespace Torneos.FactoryEmpire3D.Domain
{
    // Exact miliferrita. Rates round down once per machine; costs round up to whole ferrita.
    public readonly struct MineralAmount
    {
        public BigInteger Milli { get; }
        public MineralAmount(BigInteger milli) { if (milli < 0) throw new ArgumentOutOfRangeException(nameof(milli)); Milli = milli; }
        public static MineralAmount Parse(string value, int maxDigits = 60)
        {
            if (string.IsNullOrEmpty(value) || value.Length > Math.Min(100, maxDigits) || value.Any(c => c < '0' || c > '9'))
                throw new FormatException("Cantidad inválida.");
            return new MineralAmount(BigInteger.Parse(value, CultureInfo.InvariantCulture));
        }
        public override string ToString() => Milli.ToString(CultureInfo.InvariantCulture);
        public string Display() => (Milli / 1000).ToString("N0", CultureInfo.GetCultureInfo("es-CL")) + "," + (Milli % 1000).ToString("D3").TrimEnd('0').PadRight(1, '0');
    }
    [Serializable] public sealed class BuildingDefinition { public string id, name, description; public int width, depth, baseCost, rateMilli, supportRadius, supportPercent, requiredSectors, processingPercent, relayPercent; public bool ignoreGeology, richGeology; }
    [Serializable] public sealed class TechnologyDefinition { public string id, name, familyId; public int requiredOwned, requiredSectors, cost, numerator, denominator; }
    [Serializable] public sealed class Rules
    {
        public string version;
        public int catalogVersion;
        public string prestigeThresholdMilli;
        public int prestigeCorePercent;
        public int sectors, cellsPerSector, initialSector, veinStart, veinSize, manualCooldownMs, offlineCapMs, maxBuildings, maxLevel, maxAmountDigits;
        public int purchaseNumerator, purchaseDenominator, upgradeNumerator, upgradeDenominator, levelNumerator, levelDenominator, landBase, landNumerator, landDenominator;
        public BuildingDefinition[] buildings;
        public TechnologyDefinition[] technologies;
        public int MapSize => sectors * cellsPerSector;
        public BuildingDefinition Definition(string id) => buildings.FirstOrDefault(b => b.id == id) ?? throw new ArgumentException("Máquina desconocida.");
        public TechnologyDefinition Technology(string id) => technologies.FirstOrDefault(t => t.id == id) ?? throw new ArgumentException("Tecnología desconocida.");
    }
    [Serializable] public sealed class Structure
    {
        public string instanceId, definitionId;
        public int cellX, cellZ, orientation, level = 1;
    }
    [Serializable] public sealed class ColonySave
    {
        public int schema = 4, seed;
        public string rulesVersion, worldId, mode = "local-practice", balance = "0", extracted = "0", historical = "0";
        public long revision, lastSettledMs, lastManualMs;
        public int remainder;
        public List<int> sectors = new List<int>();
        public List<Structure> structures = new List<Structure>();
        public List<string> technologies = new List<string>();
        public string coresAwarded = "0";
        public int prestigeCount;
        public List<string> earnedAchievements = new List<string>();
    }
    public sealed class Colony
    {
        public Rules Rules { get; }
        public ColonySave State { get; }
        public MineralAmount Balance => MineralAmount.Parse(State.balance, Rules.maxAmountDigits);
        public BigInteger Rate { get; private set; }
        readonly Dictionary<int, string> occupied = new Dictionary<int, string>();
        public Colony(Rules rules, long now, int seed = 73421)
        {
            Rules = rules;
            State = new ColonySave { rulesVersion = rules.version, seed = seed, worldId = Guid.NewGuid().ToString("N"), lastSettledMs = now };
            State.sectors.Add(rules.initialSector * rules.sectors + rules.initialSector);
        }
        Colony(Rules rules, ColonySave state) { Rules = rules; State = state; }
        public static Colony Restore(Rules rules, ColonySave state)
        {
            // Only purchased technologies change production. Previous rules migrate with no purchases.
            bool legacy = state != null && (state.rulesVersion == "colony-1" || state.rulesVersion == "colony-2") && rules.version == "colony-3";
            if (state == null || state.schema < 1 || state.schema > 4 || (!legacy && state.rulesVersion != rules.version) || (state.mode != "local-practice" && state.mode != "account-practice" && state.mode != "normalized-challenge")) throw new FormatException("Versión o modo de guardado incompatible.");
            if(state.mode=="normalized-challenge"&&(state.schema!=4||state.coresAwarded!="0"||state.prestigeCount!=0||state.seed!=73421))throw new FormatException("Desafío sin condiciones normalizadas.");
            if (state.schema < 4) {
                if (MineralAmount.Parse(state.coresAwarded ?? "0").Milli != 0 || state.prestigeCount != 0) throw new FormatException("Legado incompatible con el guardado anterior.");
                state.coresAwarded = "0"; state.prestigeCount = 0; state.earnedAchievements = new List<string>();
            }
            if (state.rulesVersion == "colony-1" && (state.structures == null || state.structures.Any(b => b == null || (b.definitionId != "mining-drone" && b.definitionId != "surface-drill" && b.definitionId != "drilling-platform")))) throw new FormatException("Máquina incompatible con colony-1.");
            if ((legacy || state.schema < 3) && state.technologies != null && state.technologies.Count > 0) throw new FormatException("Tecnologías incompatibles con el guardado anterior.");
            if (state.schema == 1) state.historical = state.extracted;
            if (legacy || state.schema < 3) state.technologies = new List<string>();
            if (string.IsNullOrEmpty(state.worldId) || state.worldId.Length > 64 || state.revision < 0 || state.revision > 9999999999999L || state.lastSettledMs < 0 || state.lastSettledMs > 253402300799999L || state.lastManualMs < 0 || state.lastManualMs > 253402300799999L || state.remainder < 0 || state.remainder > 999) throw new FormatException("Guardado inválido.");
            MineralAmount.Parse(state.balance, rules.maxAmountDigits); MineralAmount.Parse(state.extracted, rules.maxAmountDigits); MineralAmount.Parse(state.historical, rules.maxAmountDigits);
            if (state.sectors == null || state.structures == null || state.sectors.Count > rules.sectors * rules.sectors || state.structures.Count > rules.maxBuildings || state.sectors.Distinct().Count() != state.sectors.Count) throw new FormatException("Mapa inválido.");
            var pending = new HashSet<int>(state.sectors);
            int first = rules.initialSector * rules.sectors + rules.initialSector;
            if (!pending.Remove(first)) throw new FormatException("Falta sector inicial.");
            var connected = new HashSet<int> { first };
            while (pending.Count > 0) {
                var next = pending.Where(s => s >= 0 && s < rules.sectors * rules.sectors && connected.Any(c => Math.Abs(s % rules.sectors - c % rules.sectors) + Math.Abs(s / rules.sectors - c / rules.sectors) == 1)).ToArray();
                if (next.Length == 0) throw new FormatException("Sectores desconectados.");
                foreach (int s in next) { pending.Remove(s); connected.Add(s); }
            }
            var colony = new Colony(rules, state);
            var ids = new HashSet<string>();
            foreach (var b in state.structures) {
                if (b == null || string.IsNullOrEmpty(b.instanceId) || b.instanceId.Length > 64 || !ids.Add(b.instanceId) || b.level < 1 || b.level > rules.maxLevel) throw new FormatException("Instancia inválida.");
                if (rules.Definition(b.definitionId).supportPercent > 0 && b.level != 1) throw new FormatException("La baliza tiene un apoyo fijo.");
                string error = colony.Placement(b.definitionId, b.cellX, b.cellZ, b.orientation);
                if (error != null) throw new FormatException(error);
                colony.Occupy(b);
            }
            if (state.technologies == null || state.technologies.Count > rules.technologies.Length || state.technologies.Distinct().Count() != state.technologies.Count) throw new FormatException("Tecnologías inválidas.");
            foreach (string id in state.technologies) {
                if (!rules.technologies.Any(t => t.id == id) || colony.TechnologyRequirement(id) != null) throw new FormatException("Tecnología desconocida o sin requisitos.");
            }
            var cores = MineralAmount.Parse(state.coresAwarded).Milli;
            if (state.prestigeCount < 0 || state.prestigeCount > 999999999 || state.prestigeCount > cores || (state.prestigeCount == 0 && cores != 0) || cores > colony.PotentialCores || state.earnedAchievements == null || state.earnedAchievements.Count > 30 || state.earnedAchievements.Distinct().Count() != state.earnedAchievements.Count || state.earnedAchievements.Any(id => string.IsNullOrEmpty(id) || id.Length > 64)) throw new FormatException("Legado persistido inválido.");
            colony.Recalculate(); state.rulesVersion = rules.version; state.schema = 4; return colony;
        }
        public BigInteger PotentialCores {
            get {
                BigInteger value = MineralAmount.Parse(State.historical).Milli / MineralAmount.Parse(Rules.prestigeThresholdMilli).Milli;
                BigInteger lo = 0, hi = 1;
                while (BigInteger.Pow(hi, 3) <= value) hi *= 2;
                while (hi - lo > 1) { var mid = (lo + hi) / 2; if (BigInteger.Pow(mid, 3) <= value) lo = mid; else hi = mid; }
                return lo;
            }
        }
        public BigInteger PrestigeGain => PotentialCores - MineralAmount.Parse(State.coresAwarded).Milli;
        public string Prestige(string expectedGain, int expectedPrestiges, long now, AchievementCatalog catalog)
        {
            if(State.mode=="normalized-challenge")return "El desafío no permite ascensiones ni legado de campaña.";
            Settle(now);
            var gain = PrestigeGain;
            if (gain <= 0) return "Extrae más ferrita histórica antes de ascender.";
            if (gain.ToString() != expectedGain || expectedPrestiges != State.prestigeCount) return "La propuesta de legado cambió. Revísala antes de confirmar.";
            if (State.prestigeCount >= 999999999) return "Límite de ascensiones alcanzado.";
            State.earnedAchievements = ColonyAchievements.Evaluate(this, catalog).Where(p => p.Unlocked).Select(p => p.Definition.id).ToList();
            State.coresAwarded = (MineralAmount.Parse(State.coresAwarded).Milli + gain).ToString(); State.prestigeCount++;
            State.balance = State.extracted = "0"; State.remainder = 0; State.lastManualMs = now;
            State.structures.Clear(); State.technologies.Clear(); State.sectors.Clear(); State.sectors.Add(Rules.initialSector * Rules.sectors + Rules.initialSector);
            occupied.Clear(); Recalculate(); State.revision++; return null;
        }
        static BigInteger Ceil(BigInteger n, BigInteger d) => (n + d - 1) / d;
        static BigInteger Escalate(int basis, int numerator, int denominator, int exponent) => Ceil(basis * BigInteger.Pow(numerator, exponent), BigInteger.Pow(denominator, exponent)) * 1000;
        public BigInteger PurchaseCost(string id) => Escalate(Rules.Definition(id).baseCost, Rules.purchaseNumerator, Rules.purchaseDenominator, State.structures.Count(s => s.definitionId == id));
        public BigInteger UpgradeCost(Structure b) => Ceil(Rules.Definition(b.definitionId).baseCost * BigInteger.Pow(Rules.upgradeNumerator, b.level - 1), 5 * BigInteger.Pow(Rules.upgradeDenominator, b.level - 1)) * 1000;
        public BigInteger LandCost => Escalate(Rules.landBase, Rules.landNumerator, Rules.landDenominator, State.sectors.Count - 1);
        public int Geology(int x, int z)
        {
            // Stable unsigned hash; independent of platform Random implementations.
            uint h = unchecked((uint)State.seed ^ (uint)x * 73856093u ^ (uint)z * 19349663u);
            h ^= h >> 16; h *= 2246822519u; h ^= h >> 13;
            return h % 10 < 2 ? 125 : h % 10 < 5 ? 110 : 100;
        }
        public bool IsVein(int x, int z) => x >= Rules.veinStart && x < Rules.veinStart + Rules.veinSize && z >= Rules.veinStart && z < Rules.veinStart + Rules.veinSize;
        public bool Unlocked(int sx, int sz) => sx >= 0 && sz >= 0 && sx < Rules.sectors && sz < Rules.sectors && State.sectors.Contains(sz * Rules.sectors + sx);
        public bool Adjacent(int sx, int sz) => Unlocked(sx - 1, sz) || Unlocked(sx + 1, sz) || Unlocked(sx, sz - 1) || Unlocked(sx, sz + 1);
        public Structure At(int x, int z) => x >= 0 && z >= 0 && x < Rules.MapSize && z < Rules.MapSize && occupied.TryGetValue(z * Rules.MapSize + x, out string id) ? State.structures.First(s => s.instanceId == id) : null;
        public (int width, int depth) Footprint(string id, int orientation) { var d = Rules.Definition(id); return orientation == 1 ? (d.depth, d.width) : (d.width, d.depth); }
        public string Placement(string id, int x, int z, int orientation, string movingId = null)
        {
            if (orientation != 0 && orientation != 1) return "Orientación inválida.";
            var required=Rules.Definition(id).requiredSectors;
            if(State.sectors.Count<required)return "Sectores: "+State.sectors.Count+"/"+required;
            var f = Footprint(id, orientation);
            if (x < 0 || z < 0 || x + f.width > Rules.MapSize || z + f.depth > Rules.MapSize) return "Fuera del mapa.";
            for (int dz = 0; dz < f.depth; dz++) for (int dx = 0; dx < f.width; dx++) {
                if (!Unlocked((x + dx) / Rules.cellsPerSector, (z + dz) / Rules.cellsPerSector)) return "Compra este sector primero.";
                if (IsVein(x + dx, z + dz)) return "La veta está reservada.";
                if (occupied.TryGetValue((z + dz) * Rules.MapSize + x + dx, out var found) && found != movingId) return "Celda ocupada.";
            }
            return null;
        }
        public int GeologyAverage(string id, int x, int z, int orientation)
        {
            var f = Footprint(id, orientation); int sum = 0;
            var d=Rules.Definition(id);
            for (int dz = 0; dz < f.depth; dz++) for (int dx = 0; dx < f.width; dx++) sum += d.ignoreGeology?100:d.richGeology?100+2*(Geology(x+dx,z+dz)-100):Geology(x + dx, z + dz);
            return sum; // Numerator; retain fractional percent for multicell footprints.
        }
        public BigInteger Production(string id, int x, int z, int orientation, int level)
            => ProductionWithBonus(id, x, z, orientation, level, SupportBonus(id, x, z, orientation));
        BigInteger ProductionWithBonus(string id, int x, int z, int orientation, int level, int bonus, string candidateTechnology = null)
        {
            var d = Rules.Definition(id); var f = Footprint(id, orientation);
            if (d.supportPercent > 0) return BigInteger.Zero;
            var technology = TechnologyFactor(id, candidateTechnology);
            return (BigInteger)d.rateMilli * BigInteger.Pow(Rules.levelNumerator, level - 1) * GeologyAverage(id, x, z, orientation) * (100 + bonus) * technology.numerator * (100+IndustryBonus(id,x,z,orientation)) * (100 + MineralAmount.Parse(State.coresAwarded).Milli * Rules.prestigeCorePercent) / (BigInteger.Pow(Rules.levelDenominator, level - 1) * 100000000 * f.width * f.depth * technology.denominator);
        }
        public int IndustryBonus(string id,int x,int z,int orientation)
        {
            var definition=Rules.Definition(id);
            if(definition.processingPercent>0&&State.structures.Any(b=>Rules.Definition(b.definitionId).rateMilli>0&&!Rules.Definition(b.definitionId).ignoreGeology&&FootprintDistance(id,x,z,orientation,b)<=1))return definition.processingPercent;
            if(id=="asteroid-miner")return State.structures.Where(b=>Rules.Definition(b.definitionId).relayPercent>0&&FootprintDistance(id,x,z,orientation,b)<=3).Select(b=>Rules.Definition(b.definitionId).relayPercent).DefaultIfEmpty(0).Max();
            return 0;
        }
        public (BigInteger numerator, BigInteger denominator) TechnologyFactor(string familyId, string candidate = null)
        {
            BigInteger n=1,d=1;
            foreach(var technology in Rules.technologies) if ((State.technologies.Contains(technology.id) || technology.id == candidate) && (string.IsNullOrEmpty(technology.familyId) || technology.familyId == familyId)) { n*=technology.numerator;d*=technology.denominator; }
            return (n,d);
        }
        public int Owned(string familyId) => State.structures.Count(b => b.definitionId == familyId);
        public BigInteger FamilyRate(string familyId) => State.structures.Where(b => b.definitionId == familyId).Aggregate(BigInteger.Zero,(sum,b)=>sum+Production(b));
        public BigInteger TechnologyGain(string id)
        {
            Rules.Technology(id);
            return State.structures.Aggregate(BigInteger.Zero,(sum,b)=>sum+ProductionWithBonus(b.definitionId,b.cellX,b.cellZ,b.orientation,b.level,SupportBonus(b.definitionId,b.cellX,b.cellZ,b.orientation),id))-Rate;
        }
        public string TechnologyRequirement(string id)
        {
            var t=Rules.Technology(id);
            if (State.sectors.Count < t.requiredSectors) return "Sectores: " + State.sectors.Count + "/" + t.requiredSectors;
            if (!string.IsNullOrEmpty(t.familyId) && Owned(t.familyId) < t.requiredOwned) return "Propiedad: " + Owned(t.familyId) + "/" + t.requiredOwned;
            return null;
        }
        public string BuyTechnology(string id, long now)
        {
            Settle(now);
            if (!Rules.technologies.Any(t=>t.id==id)) return "Tecnología desconocida.";
            if (State.technologies.Contains(id)) return "Tecnología ya comprada.";
            string error=TechnologyRequirement(id);if(error!=null)return error;
            if (!Pay((BigInteger)Rules.Technology(id).cost*1000)) return "Ferrita insuficiente.";
            State.technologies.Add(id);Recalculate();State.revision++;return null;
        }
        public int FootprintDistance(string id, int x, int z, int orientation, Structure other)
        {
            var a = Footprint(id, orientation); var b = Footprint(other.definitionId, other.orientation);
            int dx = Math.Max(0, Math.Max(x - (other.cellX + b.width - 1), other.cellX - (x + a.width - 1)));
            int dz = Math.Max(0, Math.Max(z - (other.cellZ + b.depth - 1), other.cellZ - (z + a.depth - 1)));
            return Math.Max(dx, dz);
        }
        public int SupportBonus(string id, int x, int z, int orientation, string excludingId = null, Structure candidate = null)
        {
            if (Rules.Definition(id).rateMilli <= 0 || Rules.Definition(id).supportPercent > 0) return 0;
            int best = 0;
            foreach (var beacon in State.structures) {
                if (beacon.instanceId == excludingId) continue;
                var d = Rules.Definition(beacon.definitionId);
                if (d.supportPercent > best && FootprintDistance(id, x, z, orientation, beacon) <= d.supportRadius) best = d.supportPercent;
            }
            if (candidate != null) {
                var d = Rules.Definition(candidate.definitionId);
                if (d.supportPercent > best && FootprintDistance(id, x, z, orientation, candidate) <= d.supportRadius) best = d.supportPercent;
            }
            return best;
        }
        // Pure preview: replacement removes the moving beacon's old influence before adding its new one.
        public BigInteger SupportChange(string id, int x, int z, int orientation, string movingId = null)
        {
            var candidate = new Structure { definitionId = id, cellX = x, cellZ = z, orientation = orientation };
            return State.structures.Aggregate(BigInteger.Zero, (sum, b) => sum + ProductionWithBonus(b.definitionId, b.cellX, b.cellZ, b.orientation, b.level, SupportBonus(b.definitionId, b.cellX, b.cellZ, b.orientation, movingId, candidate))) - Rate;
        }
        public int SupportedExtractors(Structure beacon) => State.structures.Count(b => Rules.Definition(b.definitionId).rateMilli > 0 && Rules.Definition(b.definitionId).supportPercent == 0 && FootprintDistance(b.definitionId, b.cellX, b.cellZ, b.orientation, beacon) <= Rules.Definition(beacon.definitionId).supportRadius);
        public BigInteger Production(Structure b) => Production(b.definitionId, b.cellX, b.cellZ, b.orientation, b.level);
        void Recalculate() { Rate = State.structures.Aggregate(BigInteger.Zero, (n, b) => n + Production(b)); }
        void Occupy(Structure b)
        {
            var f = Footprint(b.definitionId, b.orientation);
            for (int dz = 0; dz < f.depth; dz++) for (int dx = 0; dx < f.width; dx++) occupied.Add((b.cellZ + dz) * Rules.MapSize + b.cellX + dx, b.instanceId);
        }
        void Earn(BigInteger amount)
        {
            var balance = Balance.Milli + amount; var extracted = MineralAmount.Parse(State.extracted).Milli + amount; var history = MineralAmount.Parse(State.historical).Milli + amount;
            if (balance.ToString().Length > Rules.maxAmountDigits || history.ToString().Length > Rules.maxAmountDigits) throw new InvalidOperationException("Límite de cantidades alcanzado.");
            State.balance = balance.ToString(); State.extracted = extracted.ToString(); State.historical = history.ToString();
        }
        public BigInteger Settle(long now, bool offline = false)
        {
            if (now <= State.lastSettledMs) return BigInteger.Zero;
            long elapsed = now - State.lastSettledMs;
            if (offline) elapsed = Math.Min(elapsed, State.mode=="normalized-challenge"?86400000:Rules.offlineCapMs);
            BigInteger n = Rate * elapsed + State.remainder;
            BigInteger earned = n / 1000;
            Earn(earned); State.remainder = (int)(n % 1000); State.lastSettledMs = now;
            return earned;
        }
        public bool Mine(long now)
        {
            Settle(now);
            if (now < State.lastManualMs || now - State.lastManualMs < Rules.manualCooldownMs) return false;
            Earn(1000); State.lastManualMs = now; State.revision++; return true;
        }
        bool Pay(BigInteger cost) { if (Balance.Milli < cost) return false; State.balance = (Balance.Milli - cost).ToString(); return true; }
        public string Build(string id, int x, int z, int orientation, long now)
        {
            Settle(now); string error = Placement(id, x, z, orientation); if (error != null) return error;
            if (State.structures.Count >= Rules.maxBuildings) return "Máximo de 200 estructuras en este prototipo.";
            if (!Pay(PurchaseCost(id))) return "Ferrita insuficiente.";
            var b = new Structure { instanceId = Guid.NewGuid().ToString("N"), definitionId = id, cellX = x, cellZ = z, orientation = orientation };
            State.structures.Add(b); Occupy(b); Recalculate(); State.revision++; return null;
        }
        public string Move(string instanceId, int x, int z, int orientation, long now)
        {
            Settle(now); var b = State.structures.FirstOrDefault(s => s.instanceId == instanceId); if (b == null) return "Instancia desconocida.";
            string error = Placement(b.definitionId, x, z, orientation, instanceId); if (error != null) return error;
            foreach (var cell in occupied.Where(p => p.Value == instanceId).Select(p => p.Key).ToArray()) occupied.Remove(cell);
            b.cellX = x; b.cellZ = z; b.orientation = orientation; Occupy(b); Recalculate(); State.revision++; return null;
        }
        public string Upgrade(string instanceId, long now)
        {
            Settle(now); var b = State.structures.FirstOrDefault(s => s.instanceId == instanceId); if (b == null) return "Instancia desconocida.";
            if (Rules.Definition(b.definitionId).supportPercent > 0) return "La baliza ofrece un apoyo fijo de +10%; no se mejora.";
            if (b.level >= Rules.maxLevel) return "Nivel máximo de este ruleset.";
            if (!Pay(UpgradeCost(b))) return "Ferrita insuficiente.";
            b.level++; Recalculate(); State.revision++; return null;
        }
        public string BuySector(int sx, int sz, long now)
        {
            Settle(now);
            if (sx < 0 || sz < 0 || sx >= Rules.sectors || sz >= Rules.sectors) return "Fuera del mapa.";
            if (Unlocked(sx, sz)) return "Sector ya comprado.";
            if (!Adjacent(sx, sz)) return "Elige un sector contiguo por un lado.";
            if (!Pay(LandCost)) return "Ferrita insuficiente.";
            State.sectors.Add(sz * Rules.sectors + sx); State.revision++; return null;
        }
    }
}
