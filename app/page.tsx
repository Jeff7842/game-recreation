"use client";

import Image from "next/image";

export default function Home() {
  return (
    <>
    <div className="w-full justify-center items-center flex place-content-center h-screen ">
      <div className="flex w-155 max-h-155 h-fit p-10 items-center justify-center bg-[rgb(0,0,0,0.6)] border-4 border-[#00ff88]  glow-pulse">
        <div className="w-full">
          <div className="block w-full text-center gap-5 pb-5 m-auto place-items-center float-title">
            <svg xmlns="http://www.w3.org/2000/svg" width={72} height={72} viewBox="0 0 24 24" className="mb-5"><path fill="none" stroke="#ff00ff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.2 17L21 7l-6.3 3L12 7l-2.7 3L3 7l1.8 10z" ></path></svg>
          <h1 className="text-[26px] font-bold text-[#00ff88] tracking-wider leading-relaxed  text-shadow-[0_0_10px_#00ff88,0_0_00px_#00ff88,0_0_0px_#00ff88]">NETWORK <br/>
          <span className="text-[#ff00ff] text-shadow-[0_0_10px_#ff00ff,0_0_0px_#ff00ff,0_0_0px_#ff00ff]">CHECKERS</span></h1>
          </div>

          <div className="pt-5">
            
            <label htmlFor="username" className="text-[11px] text-[#00ff88]">PLAYER NAME</label>
            <div className="flex  text-[10px] text-[#00ff88] pt-1.5">
            <input type="text" id="username" name="username" placeholder="Enter your name" className="p-4 border-2 border-[#00ff88] w-full focus:outline-none placeholder-gray-500" />
            </div>
            <div className="pt-8 grid gap-4 h-auto w-full">
            <button 
            disabled={false}
            className="flex w-full gap-2 text-center justify-center bg-[#00ff88] p-5 text-black text-[12px] cursor-pointer"><svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87"></path><circle cx={9} cy={7} r={4}></circle></g></svg> Create Game</button>
            <button 
            disabled={false}
            className="flex w-full gap-2 text-center justify-center bg-[#ff00ff] p-5 text-black text-[12px] cursor-pointer"><svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 256 256"><path fill="currentColor" d="m229.5 113l-63.44-23.06L143 26.5a16 16 0 0 0-30 0L89.94 89.94L26.5 113a16 16 0 0 0 0 30l63.44 23.07L113 229.5a16 16 0 0 0 30 0l23.07-63.44L229.5 143a16 16 0 0 0 0-30m-72.42 39.3a8 8 0 0 0-4.78 4.78L128 223.9l-24.3-66.82a8 8 0 0 0-4.78-4.78L32.1 128l66.82-24.3a8 8 0 0 0 4.78-4.78L128 32.1l24.3 66.82a8 8 0 0 0 4.78 4.78L223.9 128Z"></path></svg>Join Game</button>
          </div>
          </div>
        </div>
      </div>

    </div>
    
    </>
  );
}
