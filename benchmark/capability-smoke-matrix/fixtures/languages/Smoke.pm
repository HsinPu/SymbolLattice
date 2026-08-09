package Smoke;
use Dancer2;

sub perlHandler { return "ok"; }

get "/smoke" => \&perlHandler;
