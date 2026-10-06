/** @type {import('next').NextConfig} */
const nextConfig = {
    // Keeps `next dev` from adding instruction files for agents: a run starts from the fixture as it is.
    agentRules: false,
};

export default nextConfig;
