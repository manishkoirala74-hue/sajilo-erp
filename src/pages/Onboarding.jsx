import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCircle, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { toast } from "@/components/ui/use-toast";
import { sajilo } from "@/api/sajiloClient";

export default function Onboarding() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Basic protection: if we don't have a user session, go to login.
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firstName || !lastName || !role) {
      setError("Please fill out all fields.");
      return;
    }
    
    setError("");
    setLoading(true);
    
    try {
      // Check for an invite token (e.g. stored in search params or localStorage)
      const queryParams = new URLSearchParams(location.search);
      const inviteToken = queryParams.get("invite") || localStorage.getItem("invite_token");
      
      let assignedRole = 'admin'; // Default for self-signup
      
      if (inviteToken) {
         // Logic to decode/validate invite and extract the assigned role could go here.
         // For now, if they are invited, we will assign a default staff role.
         assignedRole = 'staff';
         // Clear invite token if used
         localStorage.removeItem("invite_token");
      }

      await sajilo.entities.User.create({
        id: user.id,
        role: assignedRole,
        full_name: `${firstName} ${lastName}`.trim(),
        job_title: role,
        company_scope: 'SELECTED',
        must_change_password: false
      });
      
      // Re-trigger checkUserAuth to update the context with the newly created profile
      await checkUserAuth();
      
      toast({
        title: "Welcome aboard!",
        description: "Your profile has been created successfully.",
      });
      
      navigate("/");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={UserCircle}
      title="Complete your profile"
      subtitle="Tell us a little bit about yourself to get started."
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              placeholder="John"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="h-12"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              placeholder="Doe"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="h-12"
              required
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="role">Operational Role</Label>
          <Input
            id="role"
            placeholder="e.g., Inventory Manager, Accountant"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-12"
            required
          />
        </div>

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving Profile...
            </>
          ) : (
            "Complete Onboarding"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
