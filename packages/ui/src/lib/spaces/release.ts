// Whether the isolated-spaces feature is released to users: the switch's row in Settings, its
// search entries and the "Isolated spaces" page show only while this is true. The feature is
// built, on local Docker, and stays hidden until the maintainers decide to show it (decision 17
// in packages/web/server/lib/spaces/DOCUMENTATION.md); the `isolatedSpacesEnabled` key in
// settings.json works for the people building it meanwhile. Flip this to show it; nothing else
// needs to change.
export const ISOLATED_SPACES_RELEASED = false;
