import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { UserProfile, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isMentor: boolean;
  isOwner: boolean;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem('user_profile');
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(true);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!profile?.uid) return;
    const profileRef = doc(db, 'users', profile.uid);
    try {
      await setDoc(profileRef, updates, { merge: true });
      const updatedProfile = { ...profile, ...updates };
      setProfile(updatedProfile);
      localStorage.setItem('user_profile', JSON.stringify(updatedProfile));
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    }
  };

  useEffect(() => {
    // Force local persistence to keep users logged in until sign out
    setPersistence(auth, browserLocalPersistence).catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          // Fetch or create profile
          const profileRef = doc(db, 'users', firebaseUser.uid);
          const profileSnap = await getDoc(profileRef);
          
          if (profileSnap.exists()) {
            const data = profileSnap.data();

            let needsUpdate = false;
            
            if (data.isDeleted) {
              if (firebaseUser.email === 'prabhasoni101@gmail.com') {
                data.isDeleted = false;
                needsUpdate = true;
              } else {
                alert("Your account is temporarily deactivated. Please contact the Holy Administrator.");
                await auth.signOut();
                setUser(null);
                setProfile(null);
                localStorage.removeItem('user_profile');
                setLoading(false);
                return;
              }
            }
            
            let roleToSet = data.role;
            let templeIdToSet = data.templeId;
            
            // Auto-promote the main admin email if their role is incorrect
            if (firebaseUser.email === 'prabhasoni101@gmail.com' && roleToSet !== 'OWNER') {
              roleToSet = 'OWNER';
              needsUpdate = true;
            }

            const isGoogleSignIn = firebaseUser.providerData.some(p => p.providerId === 'google.com');
            if (isGoogleSignIn && roleToSet !== 'OWNER') {
              roleToSet = 'OWNER';
              needsUpdate = true;
            }

            if (roleToSet === 'OWNER' && !templeIdToSet) {
              templeIdToSet = firebaseUser.uid;
              needsUpdate = true;
            }

            if (needsUpdate) {
               await setDoc(profileRef, { role: roleToSet, templeId: templeIdToSet, isDeleted: false }, { merge: true });
            }
            
            const fullProfile = { uid: firebaseUser.uid, ...data, role: roleToSet, templeId: templeIdToSet } as UserProfile;
            setProfile(fullProfile);
            localStorage.setItem('user_profile', JSON.stringify(fullProfile));
          } else {
            const isGoogleSignIn = firebaseUser.providerData.some(p => p.providerId === 'google.com');
            if (isGoogleSignIn) {
              const role: UserRole = 'OWNER';
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                displayName: firebaseUser.displayName || 'Owner',
                email: firebaseUser.email || '',
                role,
                templeId: firebaseUser.uid,
              };
              await setDoc(profileRef, newProfile);
              setProfile(newProfile);
              localStorage.setItem('user_profile', JSON.stringify(newProfile));
            } else {
              // Access revoked or unregistered - but only if we are absolutely sure (online)
              // If we are offline, don't sign out automatically
              if (navigator.onLine) {
                await auth.signOut();
                setUser(null);
                setProfile(null);
                localStorage.removeItem('user_profile');
              }
            }
          }
        } catch (error) {
          console.error("Auth profile fetch error:", error);
          // If Firestore fails (e.g. timeout on mobile), keep the cached profile if we have one
          // rather than signing out the user.
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        setProfile(null);
        localStorage.removeItem('user_profile');
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signOut = async () => {
    localStorage.removeItem('user_profile');
    await auth.signOut();
  };

  const isOwner = profile?.role === 'OWNER';
  const isMentor = profile?.role === 'MENTOR' || isOwner;
  const isAdmin = isMentor; // Admin is Mentor or Owner

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isAdmin, 
      isMentor, 
      isOwner, 
      signOut,
      updateProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
