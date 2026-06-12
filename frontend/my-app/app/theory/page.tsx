"use client";

import React from "react";
import Header from "@/components/Header";

export default function TheoryPage() {
  return (
    <div className="bg-black min-h-screen text-white">
      <Header />

      <main className="w-full">
        

        <section className="relative min-h-screen flex items-center py-32 bg-[url('/assets/fermi-bg.jpg')] bg-cover bg-center bg-fixed">
          {/* Overlay oscuro para legibilidad */}
          <div className="absolute inset-0 bg-black/70"></div>
          
          <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-8 w-full">
            <div className="p-8 md:p-12 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
              <h2 className="text-sm md:text-base tracking-[0.3em] text-gray-400 mb-4">01. ASTROPHYSICS</h2>
              <h1 className="text-3xl md:text-5xl font-light tracking-widest mb-8 border-b border-white/20 pb-6">
                THE FERMI PARADOX
              </h1>
              
              <div className="space-y-6 text-sm md:text-base text-gray-300 font-light leading-relaxed tracking-wide">
                <p>
                  The Fermi Paradox presents a fundamental mathematical and observational contradiction in modern astrophysics. Considering the immense number of stars in the observable universe and the high probability of habitable planets existing in the "Goldilocks Zone," statistics suggest that intelligent extraterrestrial life should be abundant and widespread.
                </p>
                <p>
                  However, empirical evidence is nonexistent. The paradox is summarized by the question posed by physicist Enrico Fermi in 1950: "If there are so many advanced civilizations, where are they all?" This absence of signals or traces of astro-engineering (like Dyson Spheres) suggests the existence of evolutionary "Great Filters" or sociological barriers that prevent interstellar expansion, or it underscores a fundamental lack in our understanding of cosmic dynamics.
                </p>
              </div>
            </div>
          </div>
        </section>


        <section className="relative min-h-screen flex items-center py-32 bg-[url('/assets/dark-forest-bg.jpg')] bg-cover bg-center bg-fixed">
          <div className="absolute inset-0 bg-black/80"></div>
          
          <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-8 w-full">
            <div className="p-8 md:p-12 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
              <h2 className="text-sm md:text-base tracking-[0.3em] text-gray-400 mb-4">02. GAME THEORY</h2>
              <h1 className="text-3xl md:text-5xl font-light tracking-widest mb-8 border-b border-white/20 pb-6">
                THE DARK FOREST THEORY
              </h1>
              
              <div className="space-y-6 text-sm md:text-base text-gray-300 font-light leading-relaxed tracking-wide">
                <p>
                  Conceptually postulated in hard science fiction literature, the Dark Forest Theory offers a grim solution to the Fermi Paradox based on game theory and cosmic sociology. It is governed by two immutable axioms: the primary goal of any civilization is survival, and civilizations grow and expand, but the resources of the universe are finite.
                </p>
                <p>
                  Given cosmic distances, instantaneous communication is impossible, leading to an insurmountable "Chain of Suspicion." No civilization can be sure of another's intentions. Furthermore, the risk of a "Technological Explosion" implies that a seemingly harmless civilization today could become a lethal threat in a cosmically insignificant span of time.
                </p>
                <blockquote className="border-l-2 border-white/50 pl-6 my-8 italic text-white/80 text-lg">
                  The universe is a dark forest. Every civilization is an armed hunter lurking among the trees... If it finds another form of life, there is only one thing it can do: open fire and eliminate it.
                </blockquote>
                <p>
                  In this scenario of imperfect information and a zero-sum game, broadcasting signals is equivalent to revealing one's position to technologically superior predators. The dominant strategy, mathematically speaking, is absolute concealment and preemptive attack against any detected anomaly.
                </p>
              </div>
            </div>
          </div>
        </section>


        <section className="relative min-h-screen flex items-center py-32 bg-[url('/assets/ppo-bg.jpg')] bg-cover bg-center bg-fixed">
          <div className="absolute inset-0 bg-black/85"></div>
          
          <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-8 w-full">
            <div className="p-8 md:p-12 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
              <h2 className="text-sm md:text-base tracking-[0.3em] text-gray-400 mb-4">03. REINFORCEMENT LEARNING</h2>
              <h1 className="text-3xl md:text-5xl font-light tracking-widest mb-8 border-b border-white/20 pb-6">
                PROXIMAL POLICY OPTIMIZATION
              </h1>
              
              <div className="space-y-6 text-sm md:text-base text-gray-300 font-light leading-relaxed tracking-wide">
                <p>
                  To computationally model the dynamics of the Dark Forest, agents (civilizations) operate under Proximal Policy Optimization (PPO). PPO is a reinforcement learning algorithm from the Actor-Critic family based on policy gradient. Unlike Trust Region Policy Optimization (TRPO), PPO is more computationally efficient and robust to variations in network architecture.
                </p>
                <p>
                  The main innovation of PPO is its Clipped Surrogate Objective loss function. When updating neural networks, PPO mathematically penalizes disproportionately large changes in the agent's policy, limiting the probability ratio of the new and old policies using a hyperparameter epsilon. This prevents training instability and ensures that agents do not destroy functional policies during spatial exploration.
                </p>
                <p>
                  In this multi-agent simulation, PPO must evaluate dense and sparse reward functions based on survival, territorial expansion, and resource management. The system allows iteration between Independent Critic (IPPO) architectures, where each agent optimizes its policy by observing only its local environment, or a Centralized Critic (MAPPO), which stabilizes learning by providing global state information during the training phase, thereby replicating an imperfect information environment during execution.
                </p>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}