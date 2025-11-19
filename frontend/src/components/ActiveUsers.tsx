import React from 'react';

interface UserPresence {
  userId: string;
  username: string;
  color: string;
  cursor?: { line: number; column: number };
}

interface ActiveUsersProps {
  users: UserPresence[];
  currentUserId?: string;
}

export const ActiveUsers: React.FC<ActiveUsersProps> = ({ users, currentUserId }) => {
  if (users.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-1">
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {users.length} {users.length === 1 ? 'user' : 'users'} online
        </span>
      </div>

      <div className="flex items-center -space-x-2">
        {users.map((user) => (
          <div
            key={user.userId}
            className="relative group"
            title={user.username}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold border-2 border-white dark:border-gray-800 shadow-sm"
              style={{ backgroundColor: user.color }}
            >
              {user.username.substring(0, 2).toUpperCase()}
            </div>
            
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {user.username}
              {user.userId === currentUserId && ' (You)'}
            </div>

            {/* Active indicator */}
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></div>
          </div>
        ))}
      </div>

      {users.length > 5 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          +{users.length - 5} more
        </span>
      )}
    </div>
  );
};
