# nexum-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _nexum_user_zdotdir="${NEXUM_USER_ZDOTDIR:-$HOME}"
  [ -f "$_nexum_user_zdotdir/.zprofile" ] && source "$_nexum_user_zdotdir/.zprofile"
  unset _nexum_user_zdotdir
}
:
