import new_connection1.coll.res;
import new_connection1.altcoll.res as altRes;

// Two live members from modules that share a natural qualifier ("res"): the inferred type text has to
// distinguish them, which needs neither to render under the bare qualifier both would otherwise share.
public type CollisionTargetType typedesc<res:ResultA|altRes:ResultB>;

// One live member and one error-typed member from the colliding pair. The rendered text drops the error
// member (ignoreError), so only "res:ResultA" ever appears in it -- but the raw import walk still sees
// altRes:ResultBError too, and the two modules still collide on "res".
public type CollisionWithErrorTargetType typedesc<res:ResultA|altRes:ResultBError>;
