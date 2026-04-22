"use client"
import LandingNav from "@/components/LandingNav";
import { FeaturesSectionWithHoverEffects } from "@/components/feature-section-with-hover-effects";
import { GridPatternCard,GridPatternCardBody } from "@/components/ui/card-with-grid-ellipsis-pattern";
import { Hero } from "@/components/ui/animated-hero";
import Image from "next/image";


import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { Footer } from "@/components/Footer";
import React from "react";


function LandingPage() {
  return (
    
    <div className=" bg-white w-full dark:bg-background">
      {/* Navigation Bar */}
      <LandingNav />

      {/* Hero Section */}
      {/* <div className="max-w-7xl mx-auto text-center px-4">
        <p className="font-bold text-2xl sm:text-3xl md:text-4xl dark:text-white text-black mb-4">
          Next-Gen AI Call Agents for Real Conversations
        </p>
        <div className="min-h-[60px] sm:min-h-[80px]">
          <FlipWords
            className="font-bold text-2xl sm:text-3xl md:text-4xl dark:text-white text-violet-600"
            words={words}
          />
        </div>
      </div> */}

<div className="block">
  <GridPatternCard>
    <GridPatternCardBody></GridPatternCardBody>
      <Hero></Hero>
      </GridPatternCard>
      
    </div>

    <div className="mx-auto mt-6 flex max-w-5xl items-center justify-center px-4">
      <a
        href="https://t.me/Abrix_agent_bot"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-3 rounded-full border border-purple-500/30 bg-purple-500/10 px-5 py-3 text-sm font-medium text-purple-700 transition hover:bg-purple-500/20 dark:text-purple-200"
      >
        <span className="text-base">🤖</span>
        Talk to the ArbiX Telegram bot
        <span className="text-purple-500/80">→</span>
      </a>
    </div>

    <div className="flex flex-col overflow-hidden pb-[50px] pt-[50px] dark:bg-background">
      <ContainerScroll
        titleComponent={
          <>
            <h1 className="font-bold text-2xl sm:text-3xl md:text-4xl dark:text-white text-black mb-4">
              Unleash the power of <br />
              <span className="mt-1 text-purple-700 text-5xl">
              ArbiX
              </span>
            </h1>
          </>
        }
      >
        <Image
          src={`/assets/banner.jpg`}
          alt="hero"
          height={720}
          width={1400}
          className="mx-auto rounded-2xl object-cover h-full object-left-top"
          draggable={false}
        />
      </ContainerScroll>
    </div>

 

      {/* Features Section */}
      <div className="w-full mt-20 md:mt-[10%] ">
      <GridPatternCard>
      <GridPatternCardBody>
        <h1 className="font-bold text-center text-2xl sm:text-3xl md:text-4xl dark:text-purple-600 text-black mb-4">
        All-in-One Arbitrage Automation Across Chains.
        </h1>
  
    
        <div className="container mx-auto px-0 sm:px-4 mt-8 md:mt-16">
      
     
          <FeaturesSectionWithHoverEffects />
      
        </div>

        </GridPatternCardBody>
        </GridPatternCard>
      </div>

  
<br />




<div>
  <Footer></Footer>
</div>
    </div>
    
  );
}

export default LandingPage;



