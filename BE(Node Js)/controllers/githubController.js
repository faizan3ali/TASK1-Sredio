const axios = require('axios');
const Organization = require('../models/organizationModel');
const Repo = require('../models/repoModel');
const User = require('../models/userModel');

// Fetch all organizations associated with the authenticated user
exports.getOrganizations = async (req, res) => {
  const userId = req.query.userId;

  try {
    // Fetch user information
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Fetch organizations
    let response
    try {
        console.log("response",user.accessToken)
         response = await axios.get('https://api.github.com/user/orgs', {
            headers: {
              Authorization: `Bearer ${user.accessToken}`,
              Accept: "application/vnd.github+json",

            }
          });
          console.log('Granted Scopes:', response.headers['x-oauth-scopes']);
          console.log("response",response)
    } catch (error) {
        console.log("error",error)
       
    }
   

    // Save organizations in the database
    const organizations = await Promise.all(
      response.data.map(async (org) => {
        const organization = new Organization({
          githubId: org.id,
          login: org.login,
          userId: user._id
        });
        await organization.save();
        return organization;
      })
    );

    res.status(200).json(organizations);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch organizations", error: err });
  }
};

// Fetch repositories for the given organization
exports.getOrganizationRepos = async (req, res) => {
  const { organizationId, userId } = req.query;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const organization = await Organization.findById(organizationId);
    if (!organization) return res.status(404).json({ message: "Organization not found" });

    const response = await axios.get(`https://api.github.com/orgs/${organization.login}/repos`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });

    const repos = await Promise.all(response.data.map(async (repoData) => {
      const repo = new Repo({
        githubId: repoData.id,
        name: repoData.name,
        fullName: repoData.full_name,
        organizationId: organization._id,
      });
      await repo.save();
      return repo;
    }));

    res.status(200).json(repos);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch repos", error: err });
  }
};


exports.getRepoDetailsBatch = async (req, res) => {
  const { repoIds, userId } = req.body;  // Expecting repoIds as an array and userId

  try {
    // Find the user and ensure they exist
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Loop over each repoId and fetch details
    const userStats = await Promise.all(
      repoIds.map(async (repoId) => {
        try {
          // Find the repository in your database
          const repo = await Repo.findOne({ githubId: repoId });
          if (!repo) {
            // If the repo is not found, return null
            return null;
          }
    
          // Fetch data (commits, pull requests, issues) from GitHub's API
          const [commits, pullRequests, issues] = await Promise.all([
            axios.get(`https://api.github.com/repos/${repo.fullName}/commits`, {
              headers: { Authorization: `Bearer ${user.accessToken}` },
            }),
            axios.get(`https://api.github.com/repos/${repo.fullName}/pulls`, {
              headers: { Authorization: `Bearer ${user.accessToken}` },
            }),
            axios.get(`https://api.github.com/repos/${repo.fullName}/issues`, {
              headers: { Authorization: `Bearer ${user.accessToken}` },
            }),
          ]);
    console.log("useruseruseruser",user)
          // Return stats for this repository
          return {
            user: user.username,
            userId: user._id,
            repoId: repoId,
            repoName: repo.name,
            totalCommits: commits.data.length,
            totalPullRequests: pullRequests.data.length,
            totalIssues: issues.data.length,
          };
        } catch (error) {
          // Log the error and return null to ignore this repository in the final result
          console.error(`Error fetching details for repo ${repoId}:`, error.message);
          return null;
        }
      })
    );
    
    // Filter out any null values (those where an error occurred or no repo was found)
    const filteredUserStats = userStats.filter((stat) => stat !== null);
    
    // Send the filtered results back to the frontend
    res.status(200).json(filteredUserStats);


  } catch (err) {
    console.error('Error fetching batch repo details:', err.message);
    res.status(500).json({ message: "Failed to fetch repo details", error: err.message });
  }
};