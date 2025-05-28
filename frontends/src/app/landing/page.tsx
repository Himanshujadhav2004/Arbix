"use client"
import LandingNav from "@/components/LandingNav";
import { FeaturesSectionWithHoverEffects } from "@/components/feature-section-with-hover-effects";
import { GridPatternCard,GridPatternCardBody } from "@/components/ui/card-with-grid-ellipsis-pattern";
import { TestimonialsSection } from "@/components/testimonials-with-marquee";
import { Hero } from "@/components/ui/animated-hero";
import Image from "next/image";


// import {
//   BellIcon,
//   CalendarIcon,
//   FileTextIcon,
//   GlobeIcon,
//   InputIcon,
// } from "@radix-ui/react-icons";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { Footer } from "@/components/Footer";
import React from "react";

const features = [
  {
    // Icon: FileTextIcon,
    name: "Lowest Latency",
    description: "Experience ultra-low latency AI technology for seamless, real-time interactions. Enjoy instant responses, minimal delays, and smooth performance in voice communication, automation, and virtual assistance. Enhance efficiency, engagement, and user experience with lightning-fast AI designed for intelligent and uninterrupted interactions across various applications.",
    href: "/",
 
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:row-start-1 lg:row-end-4 lg:col-start-2 lg:col-end-3",
  },
  {
    // Icon: InputIcon,
    name: "AI-Powered Call Assistant",
    description: "Build intelligent AI assistants that manage phone calls with natural, human-like conversations. Automate customer interactions, answer queries, schedule appointments, and provide support effortlessly. Enhance communication, improve efficiency, and deliver a seamless calling experience with advanced AI-powered voice technology for your business..",
    href: "/",
 
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3",
  },
  {
    // Icon: GlobeIcon,
    name: "Multilingual",
    description: "Supports 100+ languages and counting.",
    href: "/",
 
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4",
  },
  {
    // Icon: CalendarIcon,
    name: "Call Automation",
    description: "Automate both inbound and outbound calls to increase efficiency and reach.",
    href: "/",
 
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:col-start-3 lg:col-end-3 lg:row-start-1 lg:row-end-2",
  },
  {
    // Icon: BellIcon,
    name: "Notifications",
    description:
      "Receive instant notifications when your AI call agent answers a call, schedules an appointment, or needs your input. Stay informed about customer interactions, missed calls, and follow-ups in real time, ensuring seamless communication and improved responsiveness for your business." ,
    href: "/",
 
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:col-start-3 lg:col-end-3 lg:row-start-2 lg:row-end-4",
  },
];


function LandingPage() {



const testimonials = [
    {
      author: {
        name: "Mr. Bhagat Agarwal",
        handle: "CEO, MB Jewels",
        avatar: "/assets/MB.jpg"
      },
      text: "Brabble.ai is a revolutionary product that India truly needs, transforming how businesses engage with their audience. We look forward to leveraging its potential to enhance customer outreach and drive innovation in the jewelry industry.",
      href: "https://www.mbjewels.in/"
    },
    {
      author: {
        name: "Mr. Razi Khan",
        handle: "CEO, ARK Tourism",
        avatar: "/assets/ARK.jpg"
      },
      text: "I remember Shreyansh sharing his idea with me while working as a consultant, and we discussed the challenges of workforce shortages in the tourism industry. I really liked the concept behind Brabble.ai, and after testing the product, I see its immense potential..",
      href: "https://twitter.com/davidtech"
    }
  ]

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



