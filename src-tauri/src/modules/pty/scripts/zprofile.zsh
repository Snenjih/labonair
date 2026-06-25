# labonair-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _labonair_user_zdotdir="${LABONAIR_USER_ZDOTDIR:-$HOME}"
  [ -f "$_labonair_user_zdotdir/.zprofile" ] && source "$_labonair_user_zdotdir/.zprofile"
  unset _labonair_user_zdotdir
}
:
