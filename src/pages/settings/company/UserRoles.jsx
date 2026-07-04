import React from 'react';
import SettingPageLayout from '../components/SettingPageLayout';
import UsersRolesComponent from '@/components/settings/UsersRoles';

const UserRoles = () => {
  return (
    <SettingPageLayout
      title="User & Access Roles"
      description="Manage system users, invite new members, and configure their permissions."
      hideActionBar={true} // UsersRoles manages its own state
    >
      <UsersRolesComponent />
    </SettingPageLayout>
  );
};

export default UserRoles;
