using System;
using System.Collections.Generic;

namespace Torneos.Puzzle2048
{
    // Offline Editor/standalone practice only. Competitive state belongs to the web server.
    public sealed class PracticeBoard
    {
        public int[] Cells { get; private set; }
        public int Score { get; private set; }
        readonly Random random;
        public PracticeBoard(int seed = 1) { random = new Random(seed); Cells = new int[16]; Spawn(); Spawn(); }
        public PracticeBoard(int[] cells, int score = 0) { if(cells.Length != 16) throw new ArgumentException("16 cells required"); Cells=(int[])cells.Clone(); Score=score; random=new Random(1); }
        public bool Slide(string direction)
        {
            if(direction != "left" && direction != "right" && direction != "up" && direction != "down") return false;
            var next = new int[16]; int gain=0;
            for(int line=0;line<4;line++)
            {
                var values=new List<int>();
                for(int offset=0;offset<4;offset++) { var v=Cells[Index(direction,line,offset)]; if(v!=0) values.Add(v); }
                int target=0;
                for(int i=0;i<values.Count;i++) {
                    int v=values[i];
                    if(i+1<values.Count && values[i+1]==v) { v*=2; gain+=v; i++; }
                    next[Index(direction,line,target++)]=v;
                }
            }
            bool changed=false; for(int i=0;i<16;i++) if(Cells[i]!=next[i]) changed=true;
            if(changed) { Cells=next; Score+=gain; }
            return changed;
        }
        static int Index(string direction,int line,int offset) => direction switch {
            "right"=>line*4+3-offset, "up"=>offset*4+line, "down"=>(3-offset)*4+line, _=>line*4+offset };
        public bool Move(string direction) { if(!Slide(direction)) return false; Spawn(); return true; }
        void Spawn() { var empty=new List<int>(); for(int i=0;i<16;i++) if(Cells[i]==0) empty.Add(i); if(empty.Count>0) Cells[empty[random.Next(empty.Count)]]=random.NextDouble()<.9?2:4; }
        public bool CanMove() {
            for(int i=0;i<16;i++) if(Cells[i]==0 || (i%4<3 && Cells[i]==Cells[i+1]) || (i/4<3 && Cells[i]==Cells[i+4])) return true;
            return false;
        }
    }
}
