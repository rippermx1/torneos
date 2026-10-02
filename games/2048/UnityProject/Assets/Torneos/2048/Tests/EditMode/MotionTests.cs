using NUnit.Framework;
namespace Torneos.Puzzle2048.Tests {
    public class MotionTests {
        [TestCase("left",0,1,0)]
        [TestCase("right",0,1,3)]
        [TestCase("up",0,4,0)]
        [TestCase("down",0,4,12)]
        public void FusionMapsBothSourcesToConfirmedDestination(string direction,int first,int second,int destination) {
            var before=new int[16]; before[first]=before[second]=2;
            var after=new int[16]; after[destination]=4; after[15]=2;
            var plan=TileMotionPlan.Confirm(before,after,direction);
            Assert.IsNotNull(plan); Assert.AreEqual(2,plan.travels.Count);
            Assert.AreEqual(destination,plan.travels[0].destination); Assert.AreEqual(destination,plan.travels[1].destination);
            Assert.IsTrue(plan.merged[destination]); Assert.IsTrue(plan.spawned[15]);
        }
        [Test] public void FourEqualTilesMergeOncePerPair() {
            var before=new[]{2,2,2,2,0,0,0,0,0,0,0,0,0,0,0,0};
            var after=new[]{4,4,2,0,0,0,0,0,0,0,0,0,0,0,0,0};
            var plan=TileMotionPlan.Confirm(before,after,"left");
            Assert.IsNotNull(plan); Assert.IsTrue(plan.merged[0]);Assert.IsTrue(plan.merged[1]);
            Assert.IsNull(TileMotionPlan.Confirm(before,new[]{8,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0},"left"));
        }
        [Test] public void NoOpAndUnrelatedServerBoardNeverInventMotion() {
            var before=new int[16];before[0]=2;
            Assert.IsNull(TileMotionPlan.Confirm(before,before,"left"));
            var after=new int[16];after[0]=128;
            Assert.IsNull(TileMotionPlan.Confirm(before,after,"right"));
            Assert.IsNull(TileMotionPlan.Confirm(before,after,null));
        }
    }
}
